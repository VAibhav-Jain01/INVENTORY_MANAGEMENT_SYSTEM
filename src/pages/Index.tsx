import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Package, ArrowRight, BarChart3, FileText, Shield } from 'lucide-react';

export default function Index() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading && user) {
      navigate('/dashboard');
    }
  }, [user, loading, navigate]);

  const features = [
    {
      icon: Package,
      title: 'Inventory Management',
      description: 'Track stock levels in real-time with low stock alerts',
    },
    {
      icon: FileText,
      title: 'Billing & Invoicing',
      description: 'Create professional invoices and manage payments',
    },
    {
      icon: BarChart3,
      title: 'Analytics Dashboard',
      description: 'Get insights into your business performance',
    },
    {
      icon: Shield,
      title: 'Secure & Reliable',
      description: 'Your data is protected with enterprise-grade security',
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-accent/10 via-transparent to-transparent" />
        <div className="absolute top-0 right-0 w-96 h-96 bg-accent/5 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />

        <div className="relative max-w-6xl mx-auto px-6 py-24 lg:py-32">
          <div className="text-center space-y-8">
            {/* Logo */}
            <div className="flex items-center justify-center gap-3 animate-fade-in">
              <div className="p-4 rounded-2xl bg-gradient-to-br from-accent to-accent/80 text-accent-foreground shadow-glow">
                <Package className="w-10 h-10" />
              </div>
              <span className="text-3xl font-bold">StockFlow</span>
            </div>

            {/* Headline */}
            <div className="space-y-4 animate-slide-up">
              <h1 className="text-4xl md:text-6xl font-bold tracking-tight">
                Manage Your Inventory
                <br />
                <span className="text-accent">With Confidence</span>
              </h1>
              <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
                The modern stock management and billing solution for growing businesses. 
                Track inventory, create invoices, and gain insights—all in one place.
              </p>
            </div>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 animate-slide-up" style={{ animationDelay: '200ms' }}>
              <Button
                size="lg"
                className="btn-accent h-12 px-8 text-lg gap-2"
                onClick={() => navigate('/auth')}
              >
                Get Started
                <ArrowRight className="w-5 h-5" />
              </Button>
              <Button
                variant="outline"
                size="lg"
                className="h-12 px-8 text-lg"
                onClick={() => navigate('/auth')}
              >
                Sign In
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Features Section */}
      <div className="max-w-6xl mx-auto px-6 py-24">
        <div className="text-center mb-16">
          <h2 className="text-3xl font-bold mb-4">Everything You Need</h2>
          <p className="text-muted-foreground max-w-xl mx-auto">
            Powerful features to help you manage your inventory and grow your business
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {features.map((feature, index) => (
            <div
              key={feature.title}
              className="stat-card animate-slide-up"
              style={{ animationDelay: `${index * 100}ms` }}
            >
              <div className="p-3 rounded-xl bg-accent/10 w-fit mb-4">
                <feature.icon className="w-6 h-6 text-accent" />
              </div>
              <h3 className="font-semibold mb-2">{feature.title}</h3>
              <p className="text-sm text-muted-foreground">{feature.description}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t bg-muted/30">
        <div className="max-w-6xl mx-auto px-6 py-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-accent/10">
                <Package className="w-5 h-5 text-accent" />
              </div>
              <span className="font-semibold">StockFlow</span>
            </div>
            <p className="text-sm text-muted-foreground">
              © {new Date().getFullYear()} StockFlow. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
