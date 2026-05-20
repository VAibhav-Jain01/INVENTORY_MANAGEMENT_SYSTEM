/* src/pages/Dashboard.tsx */
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Package,
  FileText,
  AlertTriangle,
  TrendingUp,
  IndianRupee,
  ShoppingCart,
} from 'lucide-react';
import { format } from 'date-fns';

interface DashboardStats {
  totalProducts: number;
  totalBills: number;
  lowStockItems: number;
  totalRevenue: number;
  recentBills: Array<{
    id: string;
    bill_number: string;
    customer_name: string;
    total: number;
    status: string;
    created_at: string;
  }>;
  lowStockProducts: Array<{
    id: string;
    name: string;
    quantity: number;
    low_stock_threshold: number;
  }>;
}

export default function Dashboard() {
  const { profile } = useAuth();

  const [stats, setStats] = useState<DashboardStats>({
    totalProducts: 0,
    totalBills: 0,
    lowStockItems: 0,
    totalRevenue: 0,
    recentBills: [],
    lowStockProducts: [],
  });

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      /* ---------- PRODUCTS & LOW STOCK ---------- */
      const { data: products } = await supabase
        .from('products')
        .select('id, name, quantity, low_stock_threshold');

      const lowStockProducts =
        products?.filter(
          (p) => p.quantity <= (p.low_stock_threshold || 10)
        ) || [];

      /* ---------- RECENT BILLS ---------- */
      const { data: bills } = await supabase
        .from('bills')
        .select('id, bill_number, customer_name, total, status, created_at')
        .order('created_at', { ascending: false })
        .limit(5);

      /* ---------- TOTAL REVENUE (PAID ONLY) ---------- */
      const { data: paidBills } = await supabase
        .from('bills')
        .select('total')
        .eq('status', 'paid');

      const totalRevenue =
        paidBills?.reduce((sum, bill) => sum + Number(bill.total), 0) || 0;

      /* ---------- TOTAL BILL COUNT ---------- */
      const { count: billsCount } = await supabase
        .from('bills')
        .select('*', { count: 'exact', head: true });

      setStats({
        totalProducts: products?.length || 0,
        totalBills: billsCount || 0,
        lowStockItems: lowStockProducts.length,
        totalRevenue,
        recentBills: bills || [],
        lowStockProducts: lowStockProducts.slice(0, 5),
      });
    } catch (error) {
      console.error('Dashboard fetch error:', error);
    } finally {
      setLoading(false);
    }
  };

  const statCards = [
    {
      title: 'Total Products',
      value: stats.totalProducts,
      icon: Package,
      color: 'text-primary',
      bgColor: 'bg-primary/10',
    },
    {
      title: 'Total Bills',
      value: stats.totalBills,
      icon: FileText,
      color: 'text-accent',
      bgColor: 'bg-accent/10',
    },
    {
      title: 'Low Stock Items',
      value: stats.lowStockItems,
      icon: AlertTriangle,
      color: 'text-warning',
      bgColor: 'bg-warning/10',
    },
    {
      title: 'Total Revenue',
      value: `₹${stats.totalRevenue.toLocaleString('en-IN', {
        minimumFractionDigits: 2,
      })}`,
      icon: IndianRupee,
      color: 'text-success',
      bgColor: 'bg-success/10',
    },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-8 animate-fade-in">
        {/* ---------- HEADER ---------- */}
        <div>
          <h1 className="text-3xl font-bold">
            Welcome back{profile?.company_name ? `, ${profile.company_name}` : ''}
          </h1>
          <p className="text-muted-foreground mt-1">
            Here's what's happening with your inventory today.
          </p>
        </div>

        {/* ---------- STAT CARDS ---------- */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {statCards.map((stat, index) => (
            <Card
              key={stat.title}
              className="stat-card"
              style={{ animationDelay: `${index * 100}ms` }}
            >
              <CardContent className="p-6">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-sm text-muted-foreground">{stat.title}</p>
                    <p className="text-2xl font-bold mt-2">
                      {loading ? '...' : stat.value}
                    </p>
                  </div>
                  <div className={`p-3 rounded-xl ${stat.bgColor}`}>
                    <stat.icon className={`w-6 h-6 ${stat.color}`} />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* ---------- CONTENT GRID ---------- */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* RECENT BILLS */}
          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShoppingCart className="w-5 h-5 text-accent" />
                Recent Bills
              </CardTitle>
            </CardHeader>
            <CardContent>
              {stats.recentBills.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  No bills yet
                </p>
              ) : (
                <div className="space-y-3">
                  {stats.recentBills.map((bill) => (
                    <div
                      key={bill.id}
                      className="flex justify-between p-3 rounded-lg bg-muted/50"
                    >
                      <div>
                        <p className="font-medium">{bill.customer_name}</p>
                        <p className="text-sm text-muted-foreground">
                          {bill.bill_number} •{' '}
                          {format(new Date(bill.created_at), 'MMM d, yyyy')}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold">
                          ₹{Number(bill.total).toFixed(2)}
                        </p>
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full ${
                            bill.status === 'paid'
                              ? 'badge-success'
                              : bill.status === 'cancelled'
                              ? 'badge-destructive'
                              : 'badge-warning'
                          }`}
                        >
                          {bill.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* LOW STOCK */}
          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-warning" />
                Low Stock Alert
              </CardTitle>
            </CardHeader>
            <CardContent>
              {stats.lowStockProducts.length === 0 ? (
                <div className="text-center py-8">
                  <TrendingUp className="w-12 h-12 mx-auto text-success/50 mb-2" />
                  <p className="text-muted-foreground">
                    All products are well stocked!
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {stats.lowStockProducts.map((product) => (
                    <div
                      key={product.id}
                      className="flex justify-between p-3 rounded-lg bg-warning/5 border border-warning/20"
                    >
                      <div>
                        <p className="font-medium">{product.name}</p>
                        <p className="text-sm text-muted-foreground">
                          Threshold: {product.low_stock_threshold}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold text-warning">
                          {product.quantity}
                        </p>
                        <p className="text-xs text-muted-foreground">in stock</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
