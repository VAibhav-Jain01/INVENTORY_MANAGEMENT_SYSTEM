-- Create profiles table for user/company data
CREATE TABLE public.profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  company_name TEXT NOT NULL,
  contact_no TEXT,
  email TEXT NOT NULL,
  preferred_otp_method TEXT DEFAULT 'email' CHECK (preferred_otp_method IN ('email', 'sms')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create products/inventory table
CREATE TABLE public.products (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sku TEXT,
  description TEXT,
  unit_price DECIMAL(12, 2) NOT NULL DEFAULT 0,
  quantity INTEGER NOT NULL DEFAULT 0,
  low_stock_threshold INTEGER DEFAULT 10,
  category TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create bills/invoices table
CREATE TABLE public.bills (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  bill_number TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  customer_email TEXT,
  customer_phone TEXT,
  subtotal DECIMAL(12, 2) NOT NULL DEFAULT 0,
  tax_rate DECIMAL(5, 2) DEFAULT 0,
  tax_amount DECIMAL(12, 2) DEFAULT 0,
  discount DECIMAL(12, 2) DEFAULT 0,
  total DECIMAL(12, 2) NOT NULL DEFAULT 0,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'cancelled')),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create bill items table
CREATE TABLE public.bill_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  bill_id UUID NOT NULL REFERENCES public.bills(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  unit_price DECIMAL(12, 2) NOT NULL,
  total DECIMAL(12, 2) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create OTP sessions table
CREATE TABLE public.otp_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  otp_hash TEXT NOT NULL,
  delivery_method TEXT NOT NULL CHECK (delivery_method IN ('email', 'sms')),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  attempts_left INTEGER NOT NULL DEFAULT 3,
  resend_count INTEGER NOT NULL DEFAULT 0,
  last_resend_at TIMESTAMP WITH TIME ZONE,
  used BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bill_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.otp_sessions ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);

-- Products policies
CREATE POLICY "Users can view own products" ON public.products FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own products" ON public.products FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own products" ON public.products FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own products" ON public.products FOR DELETE USING (auth.uid() = user_id);

-- Bills policies
CREATE POLICY "Users can view own bills" ON public.bills FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own bills" ON public.bills FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own bills" ON public.bills FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own bills" ON public.bills FOR DELETE USING (auth.uid() = user_id);

-- Bill items policies (based on bill ownership)
CREATE POLICY "Users can view own bill items" ON public.bill_items FOR SELECT 
  USING (EXISTS (SELECT 1 FROM public.bills WHERE bills.id = bill_items.bill_id AND bills.user_id = auth.uid()));
CREATE POLICY "Users can insert own bill items" ON public.bill_items FOR INSERT 
  WITH CHECK (EXISTS (SELECT 1 FROM public.bills WHERE bills.id = bill_items.bill_id AND bills.user_id = auth.uid()));
CREATE POLICY "Users can delete own bill items" ON public.bill_items FOR DELETE 
  USING (EXISTS (SELECT 1 FROM public.bills WHERE bills.id = bill_items.bill_id AND bills.user_id = auth.uid()));

-- OTP sessions policies (service role only for security, but allow user to check their own)
CREATE POLICY "Users can view own otp sessions" ON public.otp_sessions FOR SELECT USING (auth.uid() = user_id);

-- Function to handle profile creation on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, company_name, email, contact_no)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'company_name', 'My Company'),
    NEW.email,
    NEW.raw_user_meta_data ->> 'contact_no'
  );
  RETURN NEW;
END;
$$;

-- Trigger for profile creation
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Timestamp triggers
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_bills_updated_at BEFORE UPDATE ON public.bills FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Function to atomically decrement stock when creating bill items
CREATE OR REPLACE FUNCTION public.decrement_stock(p_product_id UUID, p_quantity INTEGER)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  current_qty INTEGER;
BEGIN
  -- Lock the row and get current quantity
  SELECT quantity INTO current_qty
  FROM public.products
  WHERE id = p_product_id
  FOR UPDATE;
  
  IF current_qty IS NULL THEN
    RAISE EXCEPTION 'Product not found';
  END IF;
  
  IF current_qty < p_quantity THEN
    RAISE EXCEPTION 'Insufficient stock. Available: %, Requested: %', current_qty, p_quantity;
  END IF;
  
  UPDATE public.products
  SET quantity = quantity - p_quantity, updated_at = now()
  WHERE id = p_product_id;
  
  RETURN TRUE;
END;
$$;