/* src/pages/Bills.tsx */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "@/hooks/use-toast";
import { Plus, Search, FileText, Loader2, Trash2, Eye, Download } from "lucide-react";
import { format } from "date-fns";

interface Product {
  id: string;
  name: string;
  sku: string | null;   // ✅ added
  unit_price: number;
  quantity: number;
}

interface BillItem {
  id?: string;
  product_id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  total: number;
  hsn_code?: string | null;
}

interface Bill {
  id: string;
  bill_number: string;
  customer_name: string;
  customer_email: string | null;
  customer_phone: string | null;
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  discount: number;
  total: number;
  status: string;
  notes: string | null;
  created_at: string;
}

export default function Bills() {
  const { user, profile, loading: authLoading } = useAuth();
  const [bills, setBills] = useState<Bill[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selectedBill, setSelectedBill] = useState<Bill | null>(null);
  const [billItems, setBillItems] = useState<BillItem[]>([]);

  // Cancel modal states
  const [cancelingBillId, setCancelingBillId] = useState<string | null>(null);
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);

  const [formData, setFormData] = useState({
    customer_name: "",
    customer_email: "",
    customer_phone: "",
    tax_rate: "0",
    discount: "0",
    notes: "",
  });

  const [items, setItems] = useState<BillItem[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<string>("");
  const [itemQuantity, setItemQuantity] = useState<string>("1");

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [billsRes, productsRes] = await Promise.all([
        supabase.from("bills").select("*").order("created_at", { ascending: false }),
        supabase.from("products").select("id, name, sku, unit_price, quantity")
      ]);

      if (billsRes.error) throw billsRes.error;
      if (productsRes.error) throw productsRes.error;

      setBills(billsRes.data || []);
      setProducts(productsRes.data || []);

      
    } catch (error) {
      console.error("Error fetching data:", error);
      toast({ title: "Error", description: "Failed to load data", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };



  const addItem = () => {
    if (!selectedProduct || !itemQuantity) return;

    const product = products.find((p) => p.id === selectedProduct);
    if (!product) return;

    const qty = parseInt(itemQuantity);
    if (qty <= 0) {
      toast({ title: "Error", description: "Quantity must be greater than 0", variant: "destructive" });
      return;
    }

    if (qty > product.quantity) {
      toast({
        title: "Error",
        description: `Only ${product.quantity} units available`,
        variant: "destructive",
      });
      return;
    }

    const existingIndex = items.findIndex((i) => i.product_id === selectedProduct);
    if (existingIndex >= 0) {
      const newItems = [...items];
      const newQty = newItems[existingIndex].quantity + qty;
      if (newQty > product.quantity) {
        toast({
          title: "Error",
          description: `Only ${product.quantity} units available`,
          variant: "destructive",
        });
        return;
      }
      newItems[existingIndex].quantity = newQty;
      newItems[existingIndex].total = newQty * product.unit_price;
      setItems(newItems);
    } else {
      setItems([
        ...items,
        {
  product_id: product.id,
  product_name: product.name,
  quantity: qty,
  unit_price: product.unit_price,
  total: qty * product.unit_price,
  hsn_code: product.sku || null, // ✅ SKU stored
}
,
      ]);
    }

    setSelectedProduct("");
    setItemQuantity("1");
  };

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const calculateTotals = () => {
    const subtotal = items.reduce((sum, item) => sum + item.total, 0);
    const taxRate = parseFloat(formData.tax_rate) || 0;
    const discount = parseFloat(formData.discount) || 0;
    const taxAmount = subtotal * (taxRate / 100);
    const total = subtotal + taxAmount - discount;
    return { subtotal, taxAmount, total };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (items.length === 0) {
      toast({ title: "Error", description: "Please add at least one item", variant: "destructive" });
      return;
    }

    setSubmitting(true);

    try {
      const { subtotal, taxAmount, total } = calculateTotals();

      // Create bill
      const { data: billData, error: billError } = await supabase
  .from("bills")
  .insert({
    user_id: user!.id,
    customer_name: formData.customer_name,
    customer_email: formData.customer_email || null,
    customer_phone: formData.customer_phone || null,
    subtotal,
    tax_rate: parseFloat(formData.tax_rate) || 0,
    tax_amount: taxAmount,
    discount: parseFloat(formData.discount) || 0,
    total,
    notes: formData.notes || null,
    status: "pending",
  })
  .select()
  .single();


      if (billError) throw billError;

      // Create bill items and decrement stock
      for (const item of items) {
        // Insert bill item
        const { error: itemError } = await supabase.from("bill_items").insert({
          bill_id: billData.id,
          product_id: item.product_id,
          product_name: item.product_name,
          quantity: item.quantity,
          unit_price: item.unit_price,
          total: item.total,
          hsn_code: item.hsn_code,
        });

        if (itemError) throw itemError;

        // Decrement stock using the atomic function
        const { error: stockError } = await supabase.rpc("decrement_stock", {
          p_product_id: item.product_id,
          p_quantity: item.quantity,
        });

        if (stockError) throw stockError;
      }

      toast({ title: "Success", description: "Bill created successfully" });
      setIsDialogOpen(false);
      resetForm();
      fetchData();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const updateBillStatus = async (billId: string, status: string) => {
    try {
      const { error } = await supabase.from("bills").update({ status }).eq("id", billId);

      if (error) throw error;
      toast({ title: "Success", description: `Bill marked as ${status}` });
      fetchData();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const viewBillDetails = async (bill: Bill) => {
    setSelectedBill(bill);
    // fetch bill items
    const { data } = await supabase.from("bill_items").select("*").eq("bill_id", bill.id).order("created_at", { ascending: true });
    setBillItems(data || []);
  };

  const resetForm = () => {
    setFormData({
      customer_name: "",
      customer_email: "",
      customer_phone: "",
      tax_rate: "0",
      discount: "0",
      notes: "",
    });
    setItems([]);
  };

  const filteredBills = bills.filter(
    (b) =>
      b.customer_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      b.bill_number.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const { subtotal, taxAmount, total } = calculateTotals();

  const formatINR = (value: number) => {
    try {
      return value.toLocaleString("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2 });
    } catch {
      return `₹${value.toFixed(2)}`;
    }
  };

  /* -------------------
     Invoice HTML generator (same as before)
     ------------------- */
  const generateInvoiceHtml = (bill: Bill, itemsToPrint: BillItem[], company: any) => {
    const taxRate = Number(bill.tax_rate) || 0;
    const cgstRate = taxRate / 2;
    const sgstRate = taxRate / 2;

    const cgstAmount = bill.tax_amount / 2;
    const sgstAmount = bill.tax_amount / 2;

    const itemsRows = itemsToPrint
      .map(
        (it, idx) => `
      <tr>
        <td style="padding:8px; border-bottom:1px solid #e6e6e6; text-align:left;">${idx + 1}</td>
        <td style="padding:8px; border-bottom:1px solid #e6e6e6; text-align:left;">${it.product_name}</td>
        <td style="padding:8px; border-bottom:1px solid #e6e6e6; text-align:center;">${it.hsn_code || "-"}</td>
        <td style="padding:8px; border-bottom:1px solid #e6e6e6; text-align:right;">${formatINR(it.unit_price)}</td>
        <td style="padding:8px; border-bottom:1px solid #e6e6e6; text-align:center;">${it.quantity}</td>
        <td style="padding:8px; border-bottom:1px solid #e6e6e6; text-align:right;">${formatINR(it.total)}</td>
      </tr>`
      )
      .join("");

    const invoiceDate = format(new Date(bill.created_at), "dd MMM yyyy, hh:mm a");

    return `
      <!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>Invoice</title>

  <style>
    body {
      font-family: monospace, Arial, sans-serif;
      margin: 0;
      padding: 0;
      font-size: 12px;
      color: #000;
    }

    .invoice {
      width: 80mm;
      padding: 6mm;
    }

    .center { text-align: center; }
    .right { text-align: right; }
    .bold { font-weight: bold; }

    .divider {
      border-top: 1px dashed #000;
      margin: 6px 0;
    }

    table {
      width: 100%;
      border-collapse: collapse;
    }

    th {
      font-size: 11px;
      text-align: left;
      border-bottom: 1px dashed #000;
      padding-bottom: 3px;
    }

    td {
      font-size: 11px;
      padding: 3px 0;
      vertical-align: top;
    }

    .totals td {
      padding: 2px 0;
    }

    .small {
      font-size: 10px;
      line-height: 1.4;
    }
  </style>
</head>

<body>
  <div class="invoice">

    <!-- Company -->
    <div class="center bold">
      ${company.company_name || ""}
    </div>

    <div class="center small">
      ${company.contact_no || ""}
      ${company.gst_number ? `<br>GSTIN: ${company.gst_number}` : ""}
    </div>

    <div class="divider"></div>

    <!-- Bill Meta -->
    <div class="small">
      <div><b>Invoice:</b> ${bill.bill_number}</div>
      <div><b>Date:</b> ${invoiceDate}</div>
    </div>

    <div class="divider"></div>

    <!-- Customer -->
    <div class="small">
      <b>Bill To:</b><br>
      ${bill.customer_name}<br>
      ${bill.customer_phone || ""}
    </div>

    <div class="divider"></div>

    <!-- Items Table -->
    <table>
      <thead>
        <tr>
          <th style="width:36%">Item</th>
          <th style="width:14%; text-align:center">HSN</th>
          <th style="width:10%; text-align:center">Qty</th>
          <th style="width:18%; text-align:right">Rate</th>
          <th style="width:22%; text-align:right">Amt</th>
        </tr>
      </thead>

      <tbody>
        ${itemsToPrint.map(item => `
          <tr>
            <td>${item.product_name}</td>
            <td style="text-align:center">${item.hsn_code || "-"}</td>
            <td style="text-align:center">${item.quantity}</td>
            <td style="text-align:right">${formatINR(item.unit_price)}</td>
            <td style="text-align:right">${formatINR(item.total)}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>

    <div class="divider"></div>

    <!-- Totals -->
    <table class="totals">
      <tr>
        <td>Subtotal</td>
        <td class="right">${formatINR(bill.subtotal)}</td>
      </tr>
      ${taxRate > 0 ? `
      <tr>
        <td>CGST (${cgstRate}%)</td>
        <td class="right">${formatINR(cgstAmount)}</td>
      </tr>
      <tr>
        <td>SGST (${sgstRate}%)</td>
        <td class="right">${formatINR(sgstAmount)}</td>
      </tr>
      ` : ''}


      ${Number(bill.discount) > 0 ? `
      <tr>
        <td>Discount</td>
        <td class="right">-${formatINR(bill.discount)}</td>
      </tr>` : ""}

      <tr class="bold">
        <td style="font-size:13px;">TOTAL</td>
        <td class="right" style="font-size:13px;">
          ${formatINR(bill.total)}
        </td>
      </tr>
    </table>

    <div class="divider"></div>

    <!-- Footer -->
    <div class="center small">
      Thank you for your purchase!<br>
      * Computer generated bill *
    </div>

  </div>
</body>
</html>

    `;
  };

  /* -------------------
     Print (open new window)
     ------------------- */
  const printBill = (bill: Bill, itemsToPrint: BillItem[]) => {
    const company = profile;
    const html = generateInvoiceHtml(bill, itemsToPrint, company);
    const win = window.open("", "_blank", "width=900,height=700");
    if (!win) {
      toast({ title: "Error", description: "Popup blocked. Allow popups to print.", variant: "destructive" });
      return;
    }
    win.document.open();
    win.document.write(html);
    win.document.close();
    // auto print after load
    win.onload = () => {
      try {
        win.print();
      } catch (e) {
        console.warn("Print failed:", e);
      }
    };
  };

  /* -------------------
     Download PDF using html2pdf.js (client-side)
     ------------------- */
  const downloadPdf = async (bill: Bill, itemsToPrint: BillItem[]) => {
    let html2pdf: any;
    try {
      html2pdf = (await import("html2pdf.js")).default || (await import("html2pdf.js"));
    } catch (e) {
      toast({
        title: "Missing dependency",
        description: "Please install html2pdf.js: `npm i html2pdf.js`",
        variant: "destructive",
      });
      console.error(e);
      return;
    }

    const company = profile;
    const htmlString = generateInvoiceHtml(bill, itemsToPrint, company);

    const container = document.createElement("div");
    container.style.position = "fixed";
    container.style.left = "-9999px";
    container.style.top = "0";
    container.innerHTML = htmlString;
    document.body.appendChild(container);

    const opt = {
      margin: [10, 10, 10, 10],
      filename: `${bill.bill_number}.pdf`,
      image: { type: "jpeg", quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
    };

    try {
      await html2pdf().set(opt).from(container).save();
      toast({ title: "Success", description: "PDF downloaded" });
    } catch (err) {
      console.error("PDF generation error:", err);
      toast({ title: "Error", description: "Failed to generate PDF", variant: "destructive" });
    } finally {
      document.body.removeChild(container);
    }
  };

  /* -------------------
     Cancel modal logic (custom modal replaces window.confirm)
     ------------------- */

  const promptCancel = (billId: string) => {
    setCancelingBillId(billId);
    setIsCancelModalOpen(true);
  };

  const confirmCancelAndRestore = async () => {
    if (!cancelingBillId) return;

    try {
      setCancelLoading(true);
      // CALL your RPC that restores (or recreates) products and cancels the bill
      const { error } = await supabase.rpc("restore_or_recreate_stock_and_cancel", { p_bill_id: cancelingBillId });

      if (error) throw error;

      toast({ title: "Success", description: "Bill cancelled and stock restored" });
      setIsCancelModalOpen(false);
      setCancelingBillId(null);
      fetchData(); // refresh bills/products
    } catch (err: any) {
      console.error("Cancel & restore error", err);
      toast({ title: "Error", description: err.message || "Failed to cancel bill", variant: "destructive" });
    } finally {
      setCancelLoading(false);
    }
  };
  if (authLoading || !profile) {
  return (
    <DashboardLayout>
      <div className="p-6 text-muted-foreground">
        Loading company profile...
      </div>
    </DashboardLayout>
  );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">Bills</h1>
            <p className="text-muted-foreground">Create and manage invoices</p>
          </div>

          <Dialog
            open={isDialogOpen}
            onOpenChange={(open) => {
              setIsDialogOpen(open);
              if (!open) resetForm();
            }}
          >
            <DialogTrigger asChild>
              <Button className="btn-accent gap-2">
                <Plus className="w-4 h-4" />
                Create Bill
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto animate-slide-up">
              <DialogHeader>
                <DialogTitle>Create New Bill</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-6 mt-4">
                {/* Customer Info */}
                <div className="space-y-4">
                  <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Customer Information</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label>Customer Name *</Label>
                      <Input
                        value={formData.customer_name}
                        onChange={(e) => setFormData({ ...formData, customer_name: e.target.value })}
                        placeholder="John Doe"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Email</Label>
                      <Input
                        type="email"
                        value={formData.customer_email}
                        onChange={(e) => setFormData({ ...formData, customer_email: e.target.value })}
                        placeholder="john@example.com"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Phone</Label>
                      <Input
                        value={formData.customer_phone}
                        onChange={(e) => setFormData({ ...formData, customer_phone: e.target.value })}
                        placeholder="+91 90000 00000"
                      />
                    </div>
                  </div>
                </div>

                {/* Add Items */}
                <div className="space-y-4">
                  <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Add Items</h3>
                  <div className="flex gap-2">
                    <Select value={selectedProduct} onValueChange={setSelectedProduct}>
                      <SelectTrigger className="flex-1">
                        <SelectValue placeholder="Select product" />
                      </SelectTrigger>
                      <SelectContent>
                        {products
                          .filter((p) => p.quantity > 0)
                          .map((product) => (
                            <SelectItem key={product.id} value={product.id}>
  {product.name}
  {product.sku ? ` [${product.sku}]` : ""}
  {" — "}
  {formatINR(product.unit_price)} ({product.quantity} in stock)
</SelectItem>

                          ))}
                      </SelectContent>
                    </Select>
                    <Input
                      type="number"
                      min="1"
                      value={itemQuantity}
                      onChange={(e) => setItemQuantity(e.target.value)}
                      className="w-24"
                      placeholder="Qty"
                    />
                    <Button type="button" onClick={addItem} variant="outline">
                      Add
                    </Button>
                  </div>

                  {/* Items List */}
                  {items.length > 0 && (
                    <div className="border rounded-lg overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Product</TableHead>
                            <TableHead className="text-right">Price</TableHead>
                            <TableHead className="text-right">Qty</TableHead>
                            <TableHead className="text-right">Total</TableHead>
                            <TableHead></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {items.map((item, index) => (
                            <TableRow key={index}>
                              <TableCell>{item.product_name}</TableCell>
                              <TableCell className="text-right">{formatINR(item.unit_price)}</TableCell>
                              <TableCell className="text-right">{item.quantity}</TableCell>
                              <TableCell className="text-right font-medium">{formatINR(item.total)}</TableCell>
                              <TableCell>
                                <Button type="button" variant="ghost" size="icon" onClick={() => removeItem(index)}>
                                  <Trash2 className="w-4 h-4 text-destructive" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>

                {/* Totals */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Tax Rate (%)</Label>
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      step="0.1"
                      value={formData.tax_rate}
                      onChange={(e) => setFormData({ ...formData, tax_rate: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Discount (₹)</Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={formData.discount}
                      onChange={(e) => setFormData({ ...formData, discount: e.target.value })}
                    />
                  </div>
                </div>

                {/* Summary */}
                <div className="bg-muted/50 p-4 rounded-lg space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Subtotal:</span>
                    <span>{formatINR(subtotal)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>Tax ({formData.tax_rate}%):</span>
                    <span>{formatINR(taxAmount)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>Discount:</span>
                    <span>-{formatINR(parseFloat(formData.discount) || 0)}</span>
                  </div>
                  <div className="flex justify-between font-bold text-lg pt-2 border-t">
                    <span>Total:</span>
                    <span className="text-accent">{formatINR(total)}</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Notes</Label>
                  <Input
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    placeholder="Additional notes..."
                  />
                </div>

                <div className="flex justify-end gap-3 pt-4">
                  <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" className="btn-accent" disabled={submitting}>
                    {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                    Create Bill
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Search */}
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search bills..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-10" />
        </div>

        {/* Bills Table */}
        <Card className="glass-card overflow-hidden">
          <CardContent className="p-0">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-accent" />
              </div>
            ) : filteredBills.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <FileText className="w-12 h-12 mb-4 opacity-50" />
                <p>{searchTerm ? "No bills match your search" : "No bills yet"}</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Bill #</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredBills.map((bill) => (
                    <TableRow key={bill.id} className="table-row">
                      <TableCell className="font-mono text-sm">{bill.bill_number}</TableCell>
                      <TableCell className="font-medium">{bill.customer_name}</TableCell>
                      <TableCell className="text-muted-foreground">{format(new Date(bill.created_at), "MMM d, yyyy")}</TableCell>
                      <TableCell className="text-right font-semibold">{formatINR(Number(bill.total))}</TableCell>
                      <TableCell>
                        <span className={
                          bill.status === 'paid' ? 'badge-success px-2 py-1 rounded text-xs' :
                          bill.status === 'cancelled' ? 'badge-destructive px-2 py-1 rounded text-xs' : 'badge-warning px-2 py-1 rounded text-xs'
                        }>{bill.status}</span>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button variant="ghost" size="icon" onClick={() => viewBillDetails(bill)}>
                            <Eye className="w-4 h-4" />
                          </Button>
                          {bill.status === "pending" && (
  <Button
    size="sm"
    variant="outline"
    onClick={() => updateBillStatus(bill.id, "paid")}
  >
    Mark Paid
  </Button>
)}

                          {/* show Cancel button only if bill is NOT already cancelled */}
                          {bill.status !== "cancelled" && (
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Cancel bill and restore stock"
                              onClick={() => promptCancel(bill.id)}
                              disabled={submitting || cancelLoading}
                            >
                              <svg className="w-4 h-4 text-destructive" viewBox="0 0 24 24" fill="none">
                                <path d="M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                <path d="M6 18L18 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            </Button>
                          )}

                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Bill Details Dialog */}
        <Dialog open={!!selectedBill} onOpenChange={() => setSelectedBill(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Bill Details - {selectedBill?.bill_number}</DialogTitle>
            </DialogHeader>
            {selectedBill && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Customer</p>
                    <p className="font-medium">{selectedBill.customer_name}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Date</p>
                    <p className="font-medium">{format(new Date(selectedBill.created_at), "MMM d, yyyy h:mm a")}</p>
                  </div>
                </div>

                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Item</TableHead>
                        <TableHead className="text-right">Price</TableHead>
                        <TableHead className="text-right">Qty</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {billItems.map((item: any) => (
                        <TableRow key={item.id}>
                          <TableCell>{item.product_name}</TableCell>
                          <TableCell className="text-right">{formatINR(Number(item.unit_price))}</TableCell>
                          <TableCell className="text-right">{item.quantity}</TableCell>
                          <TableCell className="text-right font-medium">{formatINR(Number(item.total))}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                <div className="bg-muted/50 p-4 rounded-lg space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Subtotal:</span>
                    <span>{formatINR(Number(selectedBill.subtotal))}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>Tax ({selectedBill.tax_rate}%):</span>
                    <span>{formatINR(Number(selectedBill.tax_amount))}</span>
                  </div>
                  {Number(selectedBill.discount) > 0 && (
                    <div className="flex justify-between text-sm">
                      <span>Discount:</span>
                      <span>-{formatINR(Number(selectedBill.discount))}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-bold text-lg pt-2 border-t">
                    <span>Total:</span>
                    <span className="text-accent">{formatINR(Number(selectedBill.total))}</span>
                  </div>
                </div>

                <div className="flex justify-end gap-3">
                  <Button onClick={() => printBill(selectedBill, billItems)} className="btn-primary" disabled={billItems.length === 0}>
                    <FileText className="w-4 h-4 mr-2" />
                    Print Invoice
                  </Button>

                  <Button onClick={() => downloadPdf(selectedBill, billItems)} className="btn-accent" disabled={billItems.length === 0}>
                    <Download className="w-4 h-4 mr-2" />
                    Download PDF
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Custom Cancel Confirmation Dialog (glass UI, slide-up) */}
        <Dialog open={isCancelModalOpen} onOpenChange={(open) => { setIsCancelModalOpen(open); if (!open) setCancelingBillId(null); }}>
          <DialogContent className="max-w-md animate-slide-up glass-card">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <span className="text-destructive">Cancel Bill</span>
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Are you sure you want to cancel this bill? Cancelling will restore the sold quantities back to your stock.
              </p>

              <div className="flex items-center justify-between gap-4">
                <div className="text-sm text-muted-foreground">
                  <div><strong>Bill #</strong> {cancelingBillId || "-"}</div>
                </div>

                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => { setIsCancelModalOpen(false); setCancelingBillId(null); }} disabled={cancelLoading}>
                    Close
                  </Button>

                  <Button className="btn-destructive" onClick={confirmCancelAndRestore} disabled={cancelLoading}>
                    {cancelLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                    {cancelLoading ? "Cancelling..." : "Confirm Cancel"}
                  </Button>
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
