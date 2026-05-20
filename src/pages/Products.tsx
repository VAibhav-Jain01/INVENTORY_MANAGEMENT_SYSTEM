import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { toast } from '@/hooks/use-toast';
import { Plus, Search, Edit2, Trash2, Package, Loader2 } from 'lucide-react';
import { z } from 'zod';

/* ---------------- Schema ---------------- */
const productSchema = z.object({
  name: z.string().min(1),
  sku: z.string().min(1),
  unit_price: z.number().min(0),
  quantity: z.number().int().min(0),
  low_stock_threshold: z.number().int().min(0).nullable(),
  category: z.string().nullable(),
  description: z.string().nullable(),
});

interface Product {
  id: string;
  name: string;
  sku: string;
  unit_price: number;
  quantity: number;
  low_stock_threshold: number | null;
  category: string | null;
  description: string | null;
  created_at: string;
}

/* ---------------- Component ---------------- */
export default function Products() {
  const { user } = useAuth();

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [confirmDelete, setConfirmDelete] = useState<Product | null>(null);

  const [mergeConfirm, setMergeConfirm] = useState<{
    existing: Product;
    incomingQty: number;
  } | null>(null);

  const [form, setForm] = useState({
    name: '',
    sku: '',
    unit_price: '',
    quantity: '',
    low_stock_threshold: '',
    category: '',
    description: '',
  });

  /* ---------------- Fetch Products (SAFE) ---------------- */
  useEffect(() => {
    if (!user) return;

    const fetchProducts = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) {
        toast({ title: 'Error', description: error.message, variant: 'destructive' });
      } else {
        setProducts(data || []);
      }
      setLoading(false);
    };

    fetchProducts();
  }, [user]);

  /* ---------------- Helpers ---------------- */
  const resetForm = () => {
    setForm({
      name: '',
      sku: '',
      unit_price: '',
      quantity: '',
      low_stock_threshold: '',
      category: '',
      description: '',
    });
    setEditingProduct(null);
  };

  /* ---------------- Add / Edit ---------------- */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setSubmitting(true);

    try {
      const payload = {
        name: form.name.trim(),
        sku: form.sku.trim(),
        unit_price: Number(form.unit_price),
        quantity: Number(form.quantity),
        low_stock_threshold:
          form.low_stock_threshold === '' ? null : Number(form.low_stock_threshold),
        category: form.category || null,
        description: form.description || null,
        user_id: user.id,
      };

      const parsed = productSchema.safeParse(payload);
      if (!parsed.success) {
        toast({
          title: 'Validation Error',
          description: parsed.error.errors[0].message,
          variant: 'destructive',
        });
        setSubmitting(false);
        return;
      }

      /* ---- Edit ---- */
      if (editingProduct) {
        const { error } = await supabase
          .from('products')
          .update(payload)
          .eq('id', editingProduct.id);

        if (error) throw error;

        setProducts(prev =>
          prev.map(p => (p.id === editingProduct.id ? { ...p, ...payload } : p))
        );

        toast({ title: 'Updated', description: 'Product updated successfully' });
        setIsDialogOpen(false);
        resetForm();
        return;
      }

      /* ---- Merge check (sku + name) ---- */
      const { data: existing } = await supabase
        .from<Product>('products')
        .select('*')
        .eq('user_id', user.id)
        .eq('sku', payload.sku)
        .ilike('name', payload.name)
        .maybeSingle();

      if (existing) {
        setMergeConfirm({
          existing,
          incomingQty: payload.quantity,
        });
        setSubmitting(false);
        return;
      }

      /* ---- Insert ---- */
      const { data, error } = await supabase
        .from('products')
        .insert(payload)
        .select()
        .single();

      if (error) throw error;

      setProducts(prev => [data, ...prev]);

      toast({ title: 'Added', description: 'Product added successfully' });
      setIsDialogOpen(false);
      resetForm();
    } catch (err: any) {
      toast({
        title: 'Error',
        description: err.message || 'Failed to save product',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  /* ---------------- Merge Confirm ---------------- */
  const confirmMerge = async () => {
    if (!mergeConfirm) return;

    const newQty = mergeConfirm.existing.quantity + mergeConfirm.incomingQty;

    const { error } = await supabase
      .from('products')
      .update({ quantity: newQty })
      .eq('id', mergeConfirm.existing.id);

    if (!error) {
      setProducts(prev =>
        prev.map(p =>
          p.id === mergeConfirm.existing.id ? { ...p, quantity: newQty } : p
        )
      );
      toast({ title: 'Merged', description: `New stock: ${newQty}` });
    }

    setMergeConfirm(null);
    setIsDialogOpen(false);
    resetForm();
  };

  /* ---------------- Delete ---------------- */
  const deleteProduct = async () => {
    if (!confirmDelete) return;

    const { error } = await supabase
      .from('products')
      .delete()
      .eq('id', confirmDelete.id);

    if (!error) {
      setProducts(prev => prev.filter(p => p.id !== confirmDelete.id));
      toast({ title: 'Deleted', description: 'Product deleted' });
    }

    setConfirmDelete(null);
  };

  const filteredProducts = products.filter(p =>
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.sku.toLowerCase().includes(searchTerm.toLowerCase())
  );

  /* ---------------- UI ---------------- */
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold">Products</h1>

          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button className="btn-accent">
                <Plus className="w-4 h-4 mr-2" /> Add Product
              </Button>
            </DialogTrigger>

            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingProduct ? 'Edit Product' : 'Add Product'}</DialogTitle>
              </DialogHeader>

              <form onSubmit={handleSubmit} className="space-y-3">
                <Input placeholder="Name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
                <Input placeholder="SKU" required value={form.sku} onChange={e => setForm({ ...form, sku: e.target.value })} />
                <Input type="number" placeholder="Price" value={form.unit_price} onChange={e => setForm({ ...form, unit_price: e.target.value })} />
                <Input type="number" placeholder="Quantity" value={form.quantity} onChange={e => setForm({ ...form, quantity: e.target.value })} />
                <Input type="number" placeholder="Low stock threshold (optional)" value={form.low_stock_threshold} onChange={e => setForm({ ...form, low_stock_threshold: e.target.value })} />

                <Button disabled={submitting}>
                  {submitting ? <Loader2 className="animate-spin w-4 h-4" /> : 'Save'}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" />
          <Input className="pl-10" placeholder="Search..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
        </div>

        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-10 text-center">
                <Loader2 className="animate-spin" />
              </div>
            ) : filteredProducts.length === 0 ? (
              <div className="p-10 text-center text-muted-foreground">
                <Package className="mx-auto mb-2 opacity-50" />
                No products
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead>Price</TableHead>
                    <TableHead>Stock</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredProducts.map(p => (
                    <TableRow key={p.id}>
                      <TableCell>{p.name}</TableCell>
                      <TableCell>{p.sku}</TableCell>
                      <TableCell>₹{p.unit_price}</TableCell>
                      <TableCell>{p.quantity}</TableCell>
                      <TableCell className="text-right">
                        <Button
  size="icon"
  variant="ghost"
  onClick={() => {
    setEditingProduct(p);

    setForm({
      name: p.name,
      sku: p.sku,
      unit_price: p.unit_price.toString(),
      quantity: p.quantity.toString(),
      low_stock_threshold: p.low_stock_threshold?.toString() ?? '',
      category: p.category ?? '',
      description: p.description ?? '',
    });

    setIsDialogOpen(true);
  }}
>
  <Edit2 className="w-4 h-4" />
</Button>

                        <Button size="icon" variant="ghost" onClick={() => setConfirmDelete(p)}>
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Merge */}
        <Dialog open={!!mergeConfirm} onOpenChange={() => setMergeConfirm(null)}>
          <DialogContent>
            <DialogTitle>Product exists</DialogTitle>
            <p>Update stock to {mergeConfirm && mergeConfirm.existing.quantity + mergeConfirm.incomingQty}?</p>
            <Button onClick={confirmMerge}>Proceed</Button>
          </DialogContent>
        </Dialog>

        {/* Delete */}
        <Dialog open={!!confirmDelete} onOpenChange={() => setConfirmDelete(null)}>
          <DialogContent>
            <DialogTitle>Delete product?</DialogTitle>
            <Button className="btn-destructive" onClick={deleteProduct}>Delete</Button>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
