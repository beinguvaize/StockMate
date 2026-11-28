import React, { useState } from 'react';
import { Plus, Pencil, Trash2, UserX, Users as UsersIcon, Lock, Info, AlertTriangle, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTenant } from '../context/TenantContext';
import { usePeople } from '../hooks/usePeople';
import { useNotifications } from '../context/NotificationContext';
import { MODULES_CONFIG } from '../lib/constants';
import { staffCreateSchema, passwordStrength } from '../lib/validation';
import { effectivePlan } from '../lib/tenancy';
import { cn } from '../lib/utils';
import {
  ROLE_TEMPLATES, blankForm, formFromUser, pickTemplate, togglePermission, visibleUsers,
  rolesOf, primaryRole, roleLabel, canOpenWords, userRowActions, initialsOf, avatarTone, seatNote, strengthWords,
} from '../lib/usersView';
import Dialog from '../components/ui/Dialog';
import OptionCard, { OptionGroup } from '../components/ui/OptionCard';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/ui/table';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import WriteFailure from '../components/invoices/WriteFailure';
import { Toggle, Pill, Label, Hint } from '../components/expenses/parts';

/**
 * Users & roles (web redesign, approved mockups users-01 to 08).
 *
 * Who can sign in to this shop and what each login opens. Every write is the
 * same usePeople call as before (addUser, updateUser, deleteUser); only the
 * look changed, plus a question before deactivating and the server's own
 * reason when a save or a removal is refused. View rules: lib/usersView.
 */

const AV_TONE = { a: 'bg-amber-soft text-amber-text', b: 'bg-info-soft text-info-text', g: 'bg-good-soft text-good-text', '': 'bg-well text-ink-2' };

const Empty = ({ icon: Icon, title, children, action }) => (
  <div className="m-rise rounded-[14px] border border-dashed border-[#E2E2E0] px-5 pt-14 pb-[60px] text-center">
    <div className="mx-auto mb-3.5 grid h-[52px] w-[52px] place-items-center rounded-2xl bg-tile text-body"><Icon size={24} strokeWidth={1.7} /></div>
    <h4 className="font-tight text-[17px] font-semibold">{title}</h4>
    <p className="mx-auto mt-1 mb-4 max-w-[440px] text-[13.5px] text-body">{children}</p>
    {action}
  </div>
);

const Header = ({ onAdd }) => (
  <div className="m-rise mb-[18px] flex flex-wrap items-start gap-3">
    <div className="min-w-0 flex-1">
      <h3 className="font-tight text-[20px] font-semibold tracking-[-0.01em] text-ink">Users &amp; roles</h3>
      <p className="mt-0.5 text-[13.5px] text-body">Who can sign in to this shop, and what each login can open and change.</p>
    </div>
    {onAdd && <Button onClick={onAdd}><Plus /> Add login</Button>}
  </div>
);

const Users = () => {
  const { currentUser, hasPermission } = useAuth();
  const { currentTenantId, currentTenant, businessProfile } = useTenant();
  const { users: allUsers, addUser, updateUser, deleteUser, loading, refetch } = usePeople(currentTenantId);
  const { addNotification } = useNotifications();

  const users = visibleUsers(allUsers, currentUser);
  const shopName = businessProfile?.name || currentTenant?.name || 'this shop';
  const plan = currentTenant ? effectivePlan(currentTenant) : null;

  const [isAdding, setIsAdding] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [formData, setFormData] = useState(blankForm);
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState(null);     // a validation message or a server error
  const [confirm, setConfirm] = useState(null);         // { kind: 'deactivate' | 'remove', user }
  const [confirmError, setConfirmError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [rowFailure, setRowFailure] = useState(null);

  const closeForm = () => { setIsAdding(false); setEditingUser(null); setFormError(null); };
  const openAdd = () => { setEditingUser(null); setFormData(blankForm()); setFormError(null); setIsAdding(true); };
  const openEdit = (user) => { setEditingUser(user); setFormData(formFromUser(user)); setFormError(null); setIsAdding(true); };

  // Body scroll lock while the form is open, as before.
  React.useEffect(() => {
    document.body.style.overflow = isAdding ? 'hidden' : 'unset';
    return () => { document.body.style.overflow = 'unset'; };
  }, [isAdding]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSaving) return;
    setFormError(null);
    setIsSaving(true);

    // auth.admin.createUser (bcrypt) can take 20-30s on a cold start.
    const timeout = setTimeout(() => {
      setIsSaving(false);
      addNotification('Request timed out. Please check your connection or try again.', 'warning');
    }, 45000);

    try {
      if (editingUser) {
        const res = await updateUser({ ...editingUser, ...formData });
        if (res && !res.success) { setFormError(res.error || new Error('The server refused the change.')); return; }
      } else {
        const validation = staffCreateSchema.safeParse({
          name: formData.name, email: formData.email, password: formData.password || '', roles: formData.roles,
        });
        if (!validation.success) {
          setFormError({ validation: validation.error.issues?.[0]?.message || 'Validation failed' });
          return;
        }
        let failure = null;
        const success = await addUser(formData, { onError: (err) => { failure = err; } });
        if (!success) { setFormError(failure || new Error('The login was not created.')); return; }
      }
      setIsAdding(false);
      setEditingUser(null);
      setFormData(blankForm());
    } catch (err) {
      console.error('Staff management error:', err?.message || err);
      setFormError(err);
    } finally {
      clearTimeout(timeout);
      setIsSaving(false);
    }
  };

  const setStatus = async (user, status) => {
    const res = await updateUser({ ...user, status });
    return res && !res.success ? (res.error || new Error('The server refused the change.')) : null;
  };

  const activate = async (user) => {
    setRowFailure(null);
    const err = await setStatus(user, 'ACTIVE');
    if (err) setRowFailure(err);
  };

  const runConfirm = async () => {
    if (!confirm || busy) return;
    setBusy(true); setConfirmError(null);
    let err = null;
    try {
      if (confirm.kind === 'deactivate') err = await setStatus(confirm.user, 'INACTIVE');
      else {
        const res = await deleteUser(confirm.user.id);
        if (!res?.success) err = res?.error || new Error('The server refused the removal.');
      }
    } catch (ex) { err = ex; }
    setBusy(false);
    if (err) { setConfirmError(err); return; }
    setConfirm(null);
  };
  const closeConfirm = () => { if (!busy) { setConfirm(null); setConfirmError(null); } };

  if (!hasPermission('MANAGE_USERS')) {
    return (
      <div className="flex flex-col pb-16">
        <Header />
        <Empty icon={Lock} title="Only the owner and admins manage logins"
          action={<Button variant="secondary" onClick={() => window.history.back()}>Go back</Button>}>
          Your login does not have the Users permission. Ask the owner to change it.
        </Empty>
      </div>
    );
  }

  const others = users.filter((u) => u.id !== currentUser?.id);
  const seats = seatNote(users, plan);
  const strength = formData.password ? passwordStrength(formData.password) : null;
  const confirmName = confirm?.user?.name || 'this login';
  const confirmFirst = String(confirmName).split(/\s+/)[0];

  return (
    <div className="flex flex-col pb-16">
      <Header onAdd={openAdd} />

      {rowFailure && (
        <div className="mb-3 flex items-start gap-2">
          <WriteFailure error={rowFailure} noun="change" onReread={() => { setRowFailure(null); refetch?.(); }} className="flex-1" />
          <Button variant="secondary" size="icon-sm" aria-label="Dismiss" onClick={() => setRowFailure(null)}><X /></Button>
        </div>
      )}

      {users.length > 0 && (
        <div className="m-rise overflow-hidden rounded-[14px] border border-line bg-surface" style={{ '--i': 1 }}>
          <Table>
            <TableHeader>
              <tr>
                <TableHead>Login</TableHead>
                <TableHead>Role template</TableHead>
                <TableHead>Can open</TableHead>
                <TableHead>Status</TableHead>
                <TableHead numeric>Actions</TableHead>
              </tr>
            </TableHeader>
            <TableBody>
              {users.map((user) => {
                const acts = userRowActions(user, currentUser);
                const role = primaryRole(user);
                const off = !acts.active;
                return (
                  <TableRow key={user.id}>
                    <TableCell className="py-3">
                      <div className="flex items-center gap-[11px]">
                        <span aria-hidden="true" className={cn('grid h-[34px] w-[34px] shrink-0 place-items-center rounded-full font-tight text-[12px] font-semibold', AV_TONE[avatarTone(role)])}>
                          {initialsOf(user.name)}
                        </span>
                        <div className="min-w-0">
                          <b className={cn('flex items-center gap-1.5 font-tight text-[14px] font-semibold', off ? 'text-mute' : 'text-ink')}>
                            <span className="truncate">{user.name}</span>
                            {acts.isSelf && <Pill small>You</Pill>}
                          </b>
                          <small className="block truncate text-[12px] text-mute">{user.email}</small>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="flex flex-wrap gap-1">{rolesOf(user).map((r) => <Pill key={r}>{roleLabel(r)}</Pill>)}</span>
                    </TableCell>
                    <TableCell><div className={cn('max-w-[260px] text-[12.5px]', off ? 'text-mute' : 'text-body')}>{canOpenWords(user)}</div></TableCell>
                    <TableCell>
                      <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap font-tight text-[12.5px] font-semibold', off ? 'text-mute' : 'text-ink')}>
                        <i aria-hidden="true" className={cn('h-[7px] w-[7px] rounded-full', off ? 'bg-faint' : 'bg-good')} />
                        {acts.active ? 'Active' : 'Inactive'}
                      </span>
                    </TableCell>
                    <TableCell numeric>
                      {acts.canManage ? (
                        <div className="flex items-center justify-end gap-0.5 whitespace-nowrap">
                          {acts.canEdit && (
                            <Button variant="ghost" size="icon-sm" aria-label={`Edit ${user.name}`} title="Edit permissions" onClick={() => openEdit(user)}><Pencil /></Button>
                          )}
                          {acts.canToggle && (acts.active
                            ? <Button variant="ghost" size="xs" onClick={() => { setConfirmError(null); setConfirm({ kind: 'deactivate', user }); }}>Deactivate</Button>
                            : <Button variant="ghost" size="xs" onClick={() => activate(user)}>Activate</Button>)}
                          {acts.canRemove && (
                            <Button variant="ghost" size="icon-sm" aria-label={`Remove ${user.name}`} title="Remove login"
                              className="text-bad-text hover:bg-bad-soft hover:text-bad-text"
                              onClick={() => { setConfirmError(null); setConfirm({ kind: 'remove', user }); }}><Trash2 /></Button>
                          )}
                        </div>
                      ) : (
                        <span className="font-tight text-[12px] font-semibold text-mute">Platform admin</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {loading && users.length === 0 ? (
        <div className="rounded-[14px] border border-line px-4 py-12 text-center text-[13px] text-mute">Loading logins…</div>
      ) : others.length === 0 ? (
        <div className={users.length ? 'mt-4' : ''}>
          <Empty icon={UsersIcon} title="No other logins yet"
            action={<Button variant="ghost" className="shadow-[inset_0_0_0_1px_var(--color-line)]" onClick={openAdd}><Plus /> Add the first login</Button>}>
            Add a login for each person who works on the counter, the stock or the van. Each one gets only the modules you allow.
          </Empty>
        </div>
      ) : null}

      {users.length > 0 && (
        <div className="m-rise mt-3 flex items-start gap-2.5 rounded-xl bg-tile px-3.5 py-3 text-[13px] text-body" style={{ '--i': 2 }}>
          <Info size={16} className="mt-px shrink-0 text-mute" aria-hidden="true" />
          <span><b className="font-semibold text-ink">{seats.words}.</b> Removing a login keeps everything they entered. Payroll staff are separate: a login is only for people who use the app.</span>
        </div>
      )}

      {/* New login / Edit */}
      <Dialog open={isAdding} onClose={closeForm} width={820}
        title={editingUser ? `Edit ${editingUser.name}` : 'New login'}
        subtitle={editingUser ? 'Permissions and role. The password is changed by the person themselves.' : `Someone who can sign in to ${shopName}`}
        footer={(
          <div className="flex w-full items-center gap-2 border-t border-sep pt-3.5">
            <Button variant="secondary" onClick={closeForm}>Cancel</Button>
            <Button type="submit" form="login-form" disabled={isSaving} className="ml-auto">
              {isSaving ? 'Saving…' : editingUser ? 'Save permissions' : 'Create login'}
            </Button>
          </div>
        )}>
        <form id="login-form" onSubmit={handleSubmit} className="-mx-[22px] -my-4 grid border-t border-sep md:grid-cols-[300px_minmax(0,1fr)]">
          <div className="flex flex-col px-[22px] py-4">
            <Label htmlFor="login-name">Name</Label>
            <Input id="login-name" required type="text" autoComplete="off" value={formData.name || ''}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="mb-3" />
            <Label htmlFor="login-email">Email</Label>
            <Input id="login-email" required type="email" autoComplete="off" value={formData.email || ''}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })} className="mb-3" />
            {!editingUser && (
              <>
                <Label htmlFor="login-password">Password</Label>
                <Input id="login-password" required type="password" autoComplete="new-password" value={formData.password || ''}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })} />
                <div className="mt-[7px] flex gap-1" aria-hidden="true">
                  {[0, 1, 2, 3].map((i) => (
                    <i key={i} className={cn('h-1 flex-1 rounded-pill transition-colors duration-(--dur-press)',
                      strength && i < strength.score ? (strength.score <= 1 ? 'bg-bad' : strength.score <= 2 ? 'bg-amber' : 'bg-good') : 'bg-well')} />
                  ))}
                </div>
                <Hint className="mt-1.5 mb-3 block">
                  {strength ? `${strengthWords(strength.score)}. ` : ''}At least 10 characters. Share it with them yourself; no email is sent.
                </Hint>
              </>
            )}
            <Label>Role template</Label>
            <OptionGroup aria-label="Role template" className="gap-1.5">
              {ROLE_TEMPLATES.map((t) => (
                <OptionCard key={t.id} title={t.label} hint={t.hint} selected={!!formData.roles?.includes(t.id)}
                  className="py-[9px]" onClick={() => setFormData((prev) => pickTemplate(prev, t.id))} />
              ))}
            </OptionGroup>
          </div>
          <div className="px-[22px] py-4 md:border-l md:border-sep">
            <Label>What this login can do</Label>
            <table className="w-full border-collapse">
              <thead>
                <tr className="font-tight text-[11.5px] font-semibold text-mute">
                  <th className="border-b border-line py-1.5 text-left">Module</th>
                  <th className="w-[70px] border-b border-line py-1.5 text-center">View</th>
                  <th className="w-[70px] border-b border-line py-1.5 text-center">Edit</th>
                </tr>
              </thead>
              <tbody>
                {MODULES_CONFIG.map((mod) => {
                  const perms = formData.permissions?.[mod.key] || { view: false, edit: false };
                  return (
                    <tr key={mod.key} className="text-[13px]">
                      <td className="border-b border-sep py-1.5">{mod.label}</td>
                      <td className="border-b border-sep py-1.5 text-center">
                        <span className="inline-flex"><Toggle on={perms.view} label={`${mod.label} view`} onChange={() => setFormData((prev) => togglePermission(prev, mod.key, 'view'))} /></span>
                      </td>
                      <td className="border-b border-sep py-1.5 text-center">
                        <span className="inline-flex"><Toggle on={perms.edit} label={`${mod.label} edit`} onChange={() => setFormData((prev) => togglePermission(prev, mod.key, 'edit'))} /></span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <Hint className="mt-2 block">Turning Edit on turns View on. Turning View off turns Edit off. Picking a template fills these; change any after.</Hint>
            {formError && (formError.validation
              ? <div role="alert" className="mt-2.5 rounded-[10px] bg-bad-soft px-3 py-2.5 text-[12.5px] text-bad-text">{formError.validation}</div>
              : <WriteFailure error={formError} noun={editingUser ? 'change' : 'new login'} className="mt-2.5"
                  onReread={() => { refetch?.(); closeForm(); }} />)}
          </div>
        </form>
      </Dialog>

      {/* Deactivate / Remove */}
      <Dialog open={!!confirm} onClose={closeConfirm} width={470}
        label={confirm?.kind === 'remove' ? `Remove ${confirmName}?` : `Deactivate ${confirmName}?`}
        header={confirm && (
          <div className="flex items-start gap-3">
            <span aria-hidden="true" className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-xl',
              confirm.kind === 'remove' ? 'bg-bad-soft text-bad-text' : 'bg-amber-soft text-amber-text')}>
              {confirm.kind === 'remove' ? <AlertTriangle size={18} /> : <UserX size={18} />}
            </span>
            <div className="min-w-0">
              <h3 className="font-tight text-[18px] font-semibold tracking-[-0.01em]">
                {confirm.kind === 'remove' ? `Remove ${confirmName}?` : `Deactivate ${confirmName}?`}
              </h3>
              <p className="mt-0.5 truncate text-[13px] text-body">{roleLabel(primaryRole(confirm.user))} · {confirm.user.email}</p>
            </div>
          </div>
        )}
        footer={confirm && (
          <>
            <Button variant="secondary" onClick={closeConfirm} disabled={busy}>Cancel</Button>
            <Button variant="destructive" onClick={runConfirm} disabled={busy}>
              {busy ? 'Working…' : confirm.kind === 'remove' ? 'Remove login' : 'Deactivate'}
            </Button>
          </>
        )}>
        {confirm && (
          <>
            <p className="text-[14px] text-ink-2">
              {confirm.kind === 'remove'
                ? 'The login is taken off this shop and can no longer sign in. Everything it recorded stays, under its name.'
                : `${confirmFirst} can no longer sign in, on the web or the phone. Everything entered stays. You can activate the login again at any time.`}
            </p>
            {confirmError && (
              <WriteFailure error={confirmError} noun={confirm.kind === 'remove' ? 'removal' : 'change'} className="mt-3"
                onReread={() => { refetch?.(); setConfirm(null); setConfirmError(null); }} />
            )}
          </>
        )}
      </Dialog>
    </div>
  );
};

export default Users;
