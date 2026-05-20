import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from '@/hooks/use-toast';
import { Building2, Mail, Phone, Loader2, Save } from 'lucide-react';

export default function Settings() {
  const { profile, user, refreshProfile } = useAuth();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    company_name: profile?.company_name || '',
    contact_no: profile?.contact_no || '',
    gst_number: profile?.gst_number || '',
  });

  useEffect(() => {

    if (profile) {
      setFormData({
        company_name: profile.company_name || '',
        contact_no: profile.contact_no || '',
        gst_number: (profile as any).gst_number || '',
      });
    }
  }, [profile]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setLoading(true);

    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          company_name: formData.company_name,
          contact_no: formData.contact_no,
          gst_number: formData.gst_number || null,
        })
        .eq('user_id', user.id);

      if (error) throw error;

      await refreshProfile();
      toast({ title: 'Success', description: 'Profile updated successfully' });
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-2xl animate-fade-in">
        <div>
          <h1 className="text-3xl font-bold">Settings</h1>
          <p className="text-muted-foreground">Manage your account and preferences</p>
        </div>

        <Card className="glass-card">
          <CardHeader>
            <CardTitle>Company Profile</CardTitle>
            <CardDescription>Update your business information</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="email"
                    value={user?.email || ''}
                    disabled
                    className="pl-10 bg-muted"
                  />
                </div>
                <p className="text-xs text-muted-foreground">Email cannot be changed</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="company_name">Company Name</Label>
                <div className="relative">
                  <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="company_name"
                    value={formData.company_name}
                    onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
                    placeholder="Your Company"
                    className="pl-10"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="contact_no">Phone Number</Label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="contact_no"
                    value={formData.contact_no}
                    onChange={(e) => setFormData({ ...formData, contact_no: e.target.value })}
                    placeholder="+1 234 567 8900"
                    className="pl-10"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="gst_number">GST Number (Optional)</Label>
                <Input
                  id="gst_number"
                  value={formData.gst_number}
                  onChange={(e) =>
                    setFormData({ ...formData, gst_number: e.target.value.toUpperCase() })
                  }
                  placeholder="22AAAAA0000A1Z5"
                />
              </div>


              <Button type="submit" className="btn-accent gap-2" disabled={loading}>
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save Changes
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardHeader>
            <CardTitle>Account Security</CardTitle>
            <CardDescription>Manage your password and security settings</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              To change your password, use the password reset option on the login page.
            </p>
            <Button variant="outline" onClick={() => window.location.href = '/auth'}>
              Go to Login
            </Button>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
