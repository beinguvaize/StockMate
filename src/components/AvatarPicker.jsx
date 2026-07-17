import React, { useState, useRef, useEffect } from 'react';
import { useDialogClose } from '../hooks/useDialogClose';
import { X, Upload, Check, Loader2, Camera, Sparkles } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { uploadAvatar } from '../lib/supabase';

// Ready Player Me — opens in popup, listens for postMessage with avatar URL
const RPM_POPUP_URL = 'https://demo.readyplayer.me/avatar?frameApi&clearCache';
const RPM_ORIGIN    = 'https://demo.readyplayer.me';

// Portrait thumbnail from RPM avatar GLB URL
const rpmPortrait = (avatarUrl) =>
  `${avatarUrl}.png?scene=fullbody-portrait-v1&w=256&h=256`;

export default function AvatarPicker({ onClose }) {
  useDialogClose(onClose);
  const { currentUser, updateAvatar } = useAuth();

  const isCurrentCustom = !!(
    currentUser?.avatar_url && !currentUser.avatar_url.includes('dicebear.com')
  );

  const [preview, setPreview]     = useState(currentUser?.avatar_url || null);
  const [rpmAvatarUrl, setRpmAvatarUrl] = useState(null); // the .glb URL from RPM
  const [rpmLoading, setRpmLoading] = useState(false);
  const rpmPopupRef                 = useRef(null);
  const [customFile, setCustomFile] = useState(null);
  const [saving, setSaving]       = useState(false);
  const [saved, setSaved]         = useState(false);
  const fileRef                   = useRef();

  // Listen for Ready Player Me popup postMessage
  useEffect(() => {
    const handler = (event) => {
      if (event.origin !== RPM_ORIGIN) return;
      try {
        const data = JSON.parse(event.data);
        if (
          data?.source === 'readyplayerme' &&
          data?.eventName === 'v1.avatar.exported'
        ) {
          const url = data.data.url;
          setRpmAvatarUrl(url);
          setPreview(rpmPortrait(url));
          setCustomFile(null);
          setRpmLoading(false);
          rpmPopupRef.current?.close();
          rpmPopupRef.current = null;
        }
      } catch { /* ignore non-RPM messages */ }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCustomFile(file);
    setRpmAvatarUrl(null);
    const reader = new FileReader();
    reader.onload = (ev) => setPreview(ev.target.result);
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    if (!preview) return;
    setSaving(true);
    let finalUrl = preview;

    if (customFile) {
      const { url, error } = await uploadAvatar(customFile, currentUser.id);
      if (error) { setSaving(false); return; }
      finalUrl = url;
    }
    // RPM portrait URL or uploaded photo URL — save directly
    await updateAvatar(finalUrl);
    setSaving(false);
    setSaved(true);
    setTimeout(() => { setSaved(false); onClose(); }, 1200);
  };

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-md bg-surface rounded-[2rem] shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">


        {/* Header */}
        <div className="bg-ink-primary p-6 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-white">Your Avatar</h2>
            <p className="text-[11px] text-white/60 mt-0.5">Create a 3D avatar or upload a photo</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition-all">
            <X size={16} />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Preview */}
          <div className="flex flex-col items-center gap-4">
            <div className="relative">
              <div className="w-28 h-28 rounded-full overflow-hidden ring-4 ring-accent-signature/30 shadow-xl bg-canvas flex items-center justify-center">
                {preview ? (
                  <img src={preview} alt="avatar preview" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center">
                    <span className="text-4xl font-black text-gray-300">
                      {currentUser?.name?.charAt(0)?.toUpperCase() || '?'}
                    </span>
                  </div>
                )}
              </div>
              <button
                onClick={() => fileRef.current?.click()}
                className="absolute bottom-0 right-0 w-9 h-9 rounded-full bg-ink-primary flex items-center justify-center text-white shadow-lg hover:scale-110 transition-transform"
                title="Upload photo"
              >
                <Camera size={15} />
              </button>
            </div>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
          </div>

          {/* 3D Avatar CTA */}
          <button
            onClick={() => {
              setRpmLoading(true);
              const popup = window.open(
                RPM_POPUP_URL,
                'rpm-avatar-creator',
                'width=800,height=650,left=200,top=100'
              );
              rpmPopupRef.current = popup;
              // Poll for popup closed without saving
              const interval = setInterval(() => {
                if (popup?.closed) {
                  clearInterval(interval);
                  setRpmLoading(false);
                }
              }, 500);
            }}
            disabled={rpmLoading}
            className="w-full flex items-center gap-4 p-4 rounded-2xl bg-gradient-to-r from-amber-600 to-amber-600 text-white hover:opacity-90 active:scale-[0.98] transition-all shadow-lg disabled:opacity-70"
          >
            <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
              {rpmLoading
                ? <Loader2 size={22} className="animate-spin text-white" />
                : <Sparkles size={22} className="text-yellow-300" />
              }
            </div>
            <div className="text-left">
              <p className="text-sm font-bold">{rpmLoading ? 'Waiting for avatar…' : 'Create 3D Avatar'}</p>
              <p className="text-[11px] text-white/70">
                {rpmLoading
                  ? 'Customise in the popup window, then click Save'
                  : 'Powered by Ready Player Me — free, fully customisable'}
              </p>
            </div>
          </button>

          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-black/5" />
            <span className="text-[11px] font-bold text-gray-400">OR</span>
            <div className="flex-1 h-px bg-black/5" />
          </div>

          {/* Upload */}
          <div
            onClick={() => fileRef.current?.click()}
            className="flex items-center gap-3 p-4 rounded-2xl border-2 border-dashed border-black/10 hover:border-ink-primary/30 hover:bg-canvas/50 cursor-pointer transition-all group"
          >
            <div className="w-10 h-10 rounded-xl bg-canvas flex items-center justify-center group-hover:bg-accent-signature/20 transition-colors">
              <Upload size={18} className="text-gray-500 group-hover:text-ink-primary" />
            </div>
            <div>
              <p className="text-sm font-bold text-ink-primary">Upload a photo</p>
              <p className="text-[11px] text-gray-500">JPG, PNG or GIF — max 5 MB</p>
            </div>
          </div>

          {/* Save */}
          <button
            onClick={handleSave}
            disabled={!preview || saving || saved}
            className="w-full py-3 rounded-2xl bg-ink-primary text-white text-sm font-bold flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-40"
          >
            {saving && <Loader2 size={16} className="animate-spin" />}
            {saved  && <Check  size={16} />}
            {saving ? 'Saving…' : saved ? 'Saved!' : 'Save Avatar'}
          </button>
        </div>
      </div>
    </div>
  );
}
