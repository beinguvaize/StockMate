import React, { useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { Settings as SettingsIcon, Building, Shield, Bell, Save, CheckCircle2 } from 'lucide-react';

const Settings = () => {
    const { businessProfile, updateBusinessProfile, currentUser } = useAppContext();

    const [profileData, setProfileData] = useState({
        name: businessProfile.name || '',
        country: businessProfile.country || '',
        currency: businessProfile.currency || 'USD',
        currencySymbol: businessProfile.currencySymbol || '$',
        lowStockThreshold: businessProfile.lowStockThreshold || 20
    });

    const [savedStatus, setSavedStatus] = useState(false);

    const handleSaveProfile = (e) => {
        e.preventDefault();
        updateBusinessProfile(profileData);
        setSavedStatus(true);
        setTimeout(() => setSavedStatus(false), 3000);
    };

    const { hasRole } = useAppContext();
    if (!hasRole('GLOBAL_ADMIN')) {
        return (
            <div className="page-container animate-fade-in" style={{ textAlign: 'center', marginTop: '10vh' }}>
                <Shield size={48} color="var(--danger)" style={{ marginBottom: '1rem' }} />
                <h1 className="page-title">Access Restricted</h1>
                <p style={{ color: 'var(--text-muted)' }}>Only Global Administrators can access system settings.</p>
            </div>
        );
    }

    return (
        <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '2rem', height: '100%', maxWidth: '800px', margin: '0 auto' }}>

            <div>
                <h1 className="page-title" style={{ marginBottom: '0.25rem' }}>Business Settings</h1>
                <p style={{ color: 'var(--text-muted)' }}>Configure your company profile and application preferences.</p>
            </div>

            <div className="glass-panel" style={{ overflow: 'hidden' }}>
                <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '0.75rem', backgroundColor: 'rgba(248, 250, 252, 0.5)' }}>
                    <Building size={20} className="text-primary" />
                    <h2 style={{ fontSize: '1.1rem', fontWeight: 600 }}>Company Profile</h2>
                </div>

                <div style={{ padding: '2rem' }}>
                    <form onSubmit={handleSaveProfile} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

                        <div>
                            <label>Business Name</label>
                            <input
                                required
                                type="text"
                                className="input-field"
                                value={profileData.name}
                                onChange={e => setProfileData({ ...profileData, name: e.target.value })}
                                placeholder="e.g. StockMate Retail"
                            />
                        </div>

                        <div>
                            <label>Country</label>
                            <select className="input-field" value={profileData.country} onChange={e => {
                                const country = e.target.value;
                                let currency = profileData.currency;
                                let currencySymbol = profileData.currencySymbol;
                                
                                if (country === 'India') {
                                    currency = 'INR';
                                    currencySymbol = '₹';
                                } else if (country === 'United Arab Emirates') {
                                    currency = 'AED';
                                    currencySymbol = 'AED';
                                } else if (country === 'United States') {
                                    currency = 'USD';
                                    currencySymbol = '$';
                                } else if (country === 'United Kingdom') {
                                    currency = 'GBP';
                                    currencySymbol = '£';
                                }
                                
                                setProfileData({ ...profileData, country, currency, currencySymbol });
                            }}>
                                <option value="United Arab Emirates">🇦🇪 United Arab Emirates</option>
                                <option value="United States">🇺🇸 United States</option>
                                <option value="United Kingdom">🇬🇧 United Kingdom</option>
                                <option value="Canada">🇨🇦 Canada</option>
                                <option value="Australia">🇦🇺 Australia</option>
                                <option value="India">🇮🇳 India</option>
                            </select>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                            <div>
                                <label>Currency Code</label>
                                <select className="input-field" value={profileData.currency} onChange={e => setProfileData({ ...profileData, currency: e.target.value })}>
                                    <option value="INR">INR - Indian Rupee</option>
                                    <option value="AED">AED - UAE Dirham</option>
                                    <option value="USD">USD - US Dollar</option>
                                    <option value="EUR">EUR - Euro</option>
                                    <option value="GBP">GBP - British Pound</option>
                                    <option value="CAD">CAD - Canadian Dollar</option>
                                    <option value="AUD">AUD - Australian Dollar</option>
                                </select>
                            </div>

                            <div>
                                <label>Currency Symbol</label>
                                <input
                                    required
                                    type="text"
                                    className="input-field"
                                    value={profileData.currencySymbol}
                                    onChange={e => setProfileData({ ...profileData, currencySymbol: e.target.value })}
                                    placeholder="$"
                                />
                            </div>
                        </div>

                        <div style={{ borderTop: '1px solid var(--border-color)', margin: '1rem 0', paddingTop: '1.5rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                                <Bell size={18} className="text-primary" />
                                <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>Alert Preferences</h3>
                            </div>

                            <div>
                                <label>Global Low Stock Threshold</label>
                                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Alerts trigger when an item's quantity reaches or drops below this number.</p>
                                <input
                                    required
                                    type="number"
                                    min="0"
                                    className="input-field"
                                    style={{ maxWidth: '200px' }}
                                    value={profileData.lowStockThreshold}
                                    onChange={e => setProfileData({ ...profileData, lowStockThreshold: parseInt(e.target.value) || 0 })}
                                />
                            </div>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
                            <button type="submit" className="btn btn-primary" style={{ padding: '0.75rem 2rem' }}>
                                {savedStatus ? <><CheckCircle2 size={18} /> Saved!</> : <><Save size={18} /> Save Settings</>}
                            </button>
                        </div>
                    </form>
                </div>
            </div>

            <div className="glass-panel" style={{ padding: '2rem', display: 'flex', gap: '1.5rem', alignItems: 'center', backgroundColor: 'rgba(239, 68, 68, 0.05)' }}>
                <Shield size={32} color="var(--danger)" />
                <div>
                    <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.25rem' }}>User Profiles & Role Management</h3>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.5 }}>
                        You are currently using the mock local login system. Real user email invitations, password resets, and granular permission editing will become available once the app is connected to a production database (e.g. Supabase, Firebase).
                    </p>
                </div>
            </div>

        </div>
    );
};

export default Settings;
