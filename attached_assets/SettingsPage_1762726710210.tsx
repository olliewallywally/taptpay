import { useState } from 'react';
import { Home, Package, Receipt, BarChart3, SlidersHorizontal, Upload, CheckCircle, XCircle } from 'lucide-react';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Button } from './ui/button';
import terminalIcon from 'figma:asset/334c2b7e95367d5970568548bd4fac0acb30be47.png';

interface SettingsPageProps {
  user: any;
  onNavigate: (page: string) => void;
  onLogout: () => void;
}

export function SettingsPage({ user, onNavigate, onLogout }: SettingsPageProps) {
  const [businessDetails, setBusinessDetails] = useState({
    companyName: '',
    director: '',
    address: '',
    nzbn: '',
    phone: '',
    email: '',
    gstNumber: ''
  });

  const [windcaveApi, setWindcaveApi] = useState('');
  const [apiActive, setApiActive] = useState(false);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);

  const handleBusinessChange = (field: string, value: string) => {
    setBusinessDetails(prev => ({ ...prev, [field]: value }));
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Check if it's a PNG
      if (file.type !== 'image/png') {
        alert('Please upload a PNG file only');
        return;
      }
      // Check file size (20MB max)
      if (file.size > 20 * 1024 * 1024) {
        alert('File size must be less than 20MB');
        return;
      }
      setLogoFile(file);
      // Create preview
      const reader = new FileReader();
      reader.onloadend = () => {
        setLogoPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleApiSave = () => {
    if (windcaveApi.trim()) {
      setApiActive(true);
      // Here you would normally save to backend
    }
  };

  return (
    <div className="min-h-screen bg-gray-200 pb-24">
      {/* Header */}
      <div className="bg-[#0055FF] pt-8 pb-6 rounded-b-[60px] sm:rounded-b-[100px]">
        <div className="max-w-md mx-auto px-4 sm:px-6">
          <h1 className="text-[#00E5CC] text-center text-2xl sm:text-3xl">Settings</h1>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-md mx-auto px-4 sm:px-6 mt-8">
        {/* Business Details Section */}
        <div className="bg-white rounded-2xl sm:rounded-3xl p-5 sm:p-6 mb-5">
          <h2 className="text-[#0055FF] text-xl mb-5">Business Details</h2>
          
          <div className="space-y-4">
            <div>
              <Label htmlFor="companyName" className="text-gray-700 text-sm mb-1.5 block">Company Name</Label>
              <Input
                id="companyName"
                value={businessDetails.companyName}
                onChange={(e) => handleBusinessChange('companyName', e.target.value)}
                className="border-[#0055FF] focus:border-[#00E5CC] focus:ring-[#00E5CC]"
              />
            </div>

            <div>
              <Label htmlFor="director" className="text-gray-700 text-sm mb-1.5 block">Director</Label>
              <Input
                id="director"
                value={businessDetails.director}
                onChange={(e) => handleBusinessChange('director', e.target.value)}
                className="border-[#0055FF] focus:border-[#00E5CC] focus:ring-[#00E5CC]"
              />
            </div>

            <div>
              <Label htmlFor="address" className="text-gray-700 text-sm mb-1.5 block">Address</Label>
              <Input
                id="address"
                value={businessDetails.address}
                onChange={(e) => handleBusinessChange('address', e.target.value)}
                className="border-[#0055FF] focus:border-[#00E5CC] focus:ring-[#00E5CC]"
              />
            </div>

            <div>
              <Label htmlFor="nzbn" className="text-gray-700 text-sm mb-1.5 block">NZBN</Label>
              <Input
                id="nzbn"
                value={businessDetails.nzbn}
                onChange={(e) => handleBusinessChange('nzbn', e.target.value)}
                className="border-[#0055FF] focus:border-[#00E5CC] focus:ring-[#00E5CC]"
              />
            </div>

            <div>
              <Label htmlFor="phone" className="text-gray-700 text-sm mb-1.5 block">Phone Number</Label>
              <Input
                id="phone"
                type="tel"
                value={businessDetails.phone}
                onChange={(e) => handleBusinessChange('phone', e.target.value)}
                className="border-[#0055FF] focus:border-[#00E5CC] focus:ring-[#00E5CC]"
              />
            </div>

            <div>
              <Label htmlFor="email" className="text-gray-700 text-sm mb-1.5 block">Email</Label>
              <Input
                id="email"
                type="email"
                value={businessDetails.email}
                onChange={(e) => handleBusinessChange('email', e.target.value)}
                className="border-[#0055FF] focus:border-[#00E5CC] focus:ring-[#00E5CC]"
              />
            </div>

            <div>
              <Label htmlFor="gstNumber" className="text-gray-700 text-sm mb-1.5 block">GST Number</Label>
              <Input
                id="gstNumber"
                value={businessDetails.gstNumber}
                onChange={(e) => handleBusinessChange('gstNumber', e.target.value)}
                className="border-[#0055FF] focus:border-[#00E5CC] focus:ring-[#00E5CC]"
              />
            </div>
          </div>

          <Button 
            className="w-full bg-[#00E5CC] hover:bg-[#00c9b3] text-[#0055FF] mt-5"
            onClick={() => {
              // Save business details logic here
              console.log('Saving business details:', businessDetails);
            }}
          >
            Save Business Details
          </Button>
        </div>

        {/* API Status Section */}
        <div className="bg-white rounded-2xl sm:rounded-3xl p-5 sm:p-6 mb-5">
          <h2 className="text-[#0055FF] text-xl mb-5">API Status</h2>
          
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-3">
                <Label htmlFor="windcaveApi" className="text-gray-700 text-sm">Windcave API Key</Label>
                {apiActive ? (
                  <div className="flex items-center gap-2">
                    <CheckCircle className="text-green-500" size={20} />
                    <span className="text-green-500 text-sm">Active</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <XCircle className="text-gray-400" size={20} />
                    <span className="text-gray-400 text-sm">Inactive</span>
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <Input
                  id="windcaveApi"
                  type="password"
                  value={windcaveApi}
                  onChange={(e) => setWindcaveApi(e.target.value)}
                  placeholder="Enter Windcave API key"
                  className="border-[#0055FF] focus:border-[#00E5CC] focus:ring-[#00E5CC] flex-1"
                />
                <Button 
                  onClick={handleApiSave}
                  className="bg-[#00E5CC] hover:bg-[#00c9b3] text-[#0055FF]"
                >
                  Save
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Logo Upload Section */}
        <div className="bg-white rounded-2xl sm:rounded-3xl p-5 sm:p-6 mb-5">
          <h2 className="text-[#0055FF] text-xl mb-5">Customer Payment Page Logo</h2>
          
          <div className="space-y-4">
            <div>
              <Label className="text-gray-700 text-sm mb-2 block">Upload Logo (PNG only, max 20MB)</Label>
              <div className="border-2 border-dashed border-[#0055FF] rounded-xl p-6 text-center">
                {logoPreview ? (
                  <div className="space-y-3">
                    <img src={logoPreview} alt="Logo preview" className="max-h-32 mx-auto" />
                    <p className="text-sm text-gray-600">{logoFile?.name}</p>
                    <Button
                      onClick={() => {
                        setLogoFile(null);
                        setLogoPreview(null);
                      }}
                      variant="outline"
                      className="border-[#0055FF] text-[#0055FF]"
                    >
                      Remove
                    </Button>
                  </div>
                ) : (
                  <label htmlFor="logo-upload" className="cursor-pointer">
                    <Upload className="mx-auto text-[#0055FF] mb-2" size={32} />
                    <p className="text-[#0055FF] mb-1">Click to upload logo</p>
                    <p className="text-gray-500 text-sm">PNG files only, max 20MB</p>
                    <input
                      id="logo-upload"
                      type="file"
                      accept=".png"
                      onChange={handleLogoUpload}
                      className="hidden"
                    />
                  </label>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Customer Payment Page Button */}
        <div className="mb-5">
          <Button
            onClick={() => onNavigate('payment')}
            className="w-full bg-[#0055FF] hover:bg-[#0044dd] text-[#00E5CC] py-6 rounded-2xl text-lg"
          >
            Customer Payment Page
          </Button>
        </div>

        {/* Logout Button */}
        <div className="mb-8">
          <Button
            onClick={onLogout}
            className="w-full bg-red-500 hover:bg-red-600 text-white py-6 rounded-2xl text-lg"
          >
            Log Out
          </Button>
        </div>
      </div>

      {/* Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 bg-[#2C2C2E] rounded-t-[24px] sm:rounded-t-[32px] px-4 sm:px-8 py-4 sm:py-6 z-50">
        <div className="max-w-md mx-auto flex items-center justify-between gap-2">
          <button 
            onClick={() => onNavigate('dashboard')}
            className="flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12 hover:bg-gray-700 rounded-xl sm:rounded-2xl transition-colors"
          >
            <Home className="text-white" size={20} />
          </button>
          <button 
            onClick={() => onNavigate('stock')}
            className="flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12 hover:bg-gray-700 rounded-xl sm:rounded-2xl transition-colors"
          >
            <Package className="text-white" size={20} />
          </button>
          <button 
            onClick={() => onNavigate('terminal')}
            className="flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12 hover:bg-gray-700 rounded-xl sm:rounded-2xl transition-colors"
          >
            <img src={terminalIcon} alt="Terminal" className="w-5 h-5 sm:w-6 sm:h-6 invert" />
          </button>
          <button 
            onClick={() => onNavigate('analytics')}
            className="flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12 hover:bg-gray-700 rounded-xl sm:rounded-2xl transition-colors"
          >
            <BarChart3 className="text-white" size={20} />
          </button>
          <button 
            onClick={() => onNavigate('settings')}
            className="flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12 bg-[#0055FF] rounded-xl sm:rounded-2xl transition-colors"
          >
            <SlidersHorizontal className="text-white" size={20} />
          </button>
        </div>
      </div>
    </div>
  );
}
