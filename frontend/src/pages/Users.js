import React, { useState, useEffect, useRef } from 'react';
import Layout from '../components/Layout';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '../components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '../components/ui/alert-dialog';
import { Switch } from '../components/ui/switch';
import { Plus, Users as UsersIcon, Mail, Phone, Pencil, Key, Trash2, RotateCcw, Download, Upload, BarChart3, Clock } from 'lucide-react';
import { toast } from 'sonner';
import api from '../utils/api';
import { format } from 'date-fns';
import { useLanguage } from '../contexts/LanguageContext';

const Users = ({ user, onLogout }) => {
  const { t } = useLanguage();
  const [users, setUsers] = useState([]);
  const [lines, setLines] = useState([]);
  const [areas, setAreas] = useState([]);
  const [showDialog, setShowDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [newUser, setNewUser] = useState({
    username: '',
    password: '',
    email: '',
    role: 'medical_rep',
    full_name: '',
    phone: '',
    line_id: '',
    area_id: '',
    manager_id: '',
  });
  const [editForm, setEditForm] = useState({
    username: '',  // Add username editing
    email: '',
    full_name: '',
    phone: '',
    role: '',
    line_id: '',
    area_id: '',
    manager_id: '',
    password: '', // For password change (optional)
  });
  const [loading, setLoading] = useState(false);
  const [showDeletedUsers, setShowDeletedUsers] = useState(false);
  const [deleteConfirmUser, setDeleteConfirmUser] = useState(null);
  const [userStats, setUserStats] = useState(null);
  const [showStatsDialog, setShowStatsDialog] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    fetchUsers();
    fetchLines();
    fetchAreas();
  }, [user, showDeletedUsers]);

  const fetchUsers = async () => {
    try {
      const response = await api.get(`/users${showDeletedUsers ? '?include_deleted=true' : ''}`);
      setUsers(response.data);
    } catch (error) {
      toast.error('Failed to load users');
    }
  };

  const handleDeleteUser = async (userId) => {
    try {
      await api.delete(`/users/${userId}`);
      toast.success('User deleted successfully');
      setDeleteConfirmUser(null);
      fetchUsers();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to delete user');
    }
  };

  const handleRestoreUser = async (userId) => {
    try {
      await api.post(`/users/${userId}/restore`);
      toast.success('User restored successfully');
      fetchUsers();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to restore user');
    }
  };

  const handleExportCSV = async () => {
    try {
      const response = await api.get('/users/export-csv', { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'users_export.csv');
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success('CSV exported successfully');
    } catch (error) {
      toast.error('Failed to export CSV');
    }
  };

  const handleImportCSV = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await api.post('/users/import-csv', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      toast.success(`Imported ${response.data.imported} users`);
      if (response.data.errors?.length > 0) {
        toast.warning(`${response.data.errors.length} errors occurred`);
      }
      fetchUsers();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to import CSV');
    }
    e.target.value = ''; // Reset file input
  };

  const handleShowStats = async (userId) => {
    try {
      const response = await api.get(`/users/${userId}/stats`);
      setUserStats(response.data);
      setShowStatsDialog(true);
    } catch (error) {
      toast.error('Failed to load stats');
    }
  };

  const fetchLines = async () => {
    try {
      const response = await api.get('/lines');
      setLines(response.data);
    } catch (error) {
      toast.error('Failed to load lines');
    }
  };

  const fetchAreas = async () => {
    try {
      const response = await api.get('/areas');
      setAreas(response.data);
    } catch (error) {
      toast.error('Failed to load areas');
    }
  };

  const handleToggleAccess = async (userId, currentStatus) => {
    try {
      await api.patch(`/users/${userId}`, { is_active: !currentStatus });
      toast.success('User access updated');
      fetchUsers();
    } catch (error) {
      toast.error('Failed to update user access');
    }
  };

  const handleToggleGPS = async (userId, currentStatus) => {
    try {
      await api.patch(`/users/${userId}`, { gps_enabled: !currentStatus });
      toast.success('GPS setting updated');
      fetchUsers();
    } catch (error) {
      toast.error('Failed to update GPS setting');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      await api.post('/users', newUser);
      toast.success('User created successfully');
      setShowDialog(false);
      setNewUser({
        username: '',
        password: '',
        email: '',
        role: 'medical_rep',
        full_name: '',
        phone: '',
        line_id: '',
        area_id: '',
        manager_id: '',
      });
      fetchUsers();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to create user');
    } finally {
      setLoading(false);
    }
  };

  const handleEditClick = (userToEdit) => {
    setEditingUser(userToEdit);
    setEditForm({
      username: userToEdit.username || '',
      email: userToEdit.email || '',
      full_name: userToEdit.full_name || '',
      phone: userToEdit.phone || '',
      role: userToEdit.role || 'medical_rep',
      line_id: userToEdit.line_id || '',
      area_id: userToEdit.area_id || '',
      manager_id: userToEdit.manager_id || '',
      password: '', // Always empty - only fill if changing
    });
    setShowEditDialog(true);
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Only send non-empty fields
      const updateData = {};
      if (editForm.username && editForm.username !== editingUser.username) updateData.username = editForm.username;
      if (editForm.email !== editingUser.email) updateData.email = editForm.email;
      if (editForm.full_name !== editingUser.full_name) updateData.full_name = editForm.full_name;
      if (editForm.phone !== editingUser.phone) updateData.phone = editForm.phone;
      if (editForm.role !== editingUser.role) updateData.role = editForm.role;
      if (editForm.line_id !== (editingUser.line_id || '')) updateData.line_id = editForm.line_id || null;
      if (editForm.area_id !== (editingUser.area_id || '')) updateData.area_id = editForm.area_id || null;
      if (editForm.manager_id !== (editingUser.manager_id || '')) updateData.manager_id = editForm.manager_id || null;
      if (editForm.password && editForm.password.length >= 6) updateData.password = editForm.password;

      if (Object.keys(updateData).length === 0) {
        toast.info('No changes to save');
        setShowEditDialog(false);
        setEditingUser(null);
        return;
      }

      await api.patch(`/users/${editingUser.id}`, updateData);
      toast.success('User updated successfully');
      setShowEditDialog(false);
      setEditingUser(null);
      fetchUsers();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to update user');
    } finally {
      setLoading(false);
    }
  };

  // Get line name helper
  const getLineName = (lineId) => {
    const line = lines.find(l => l.id === lineId);
    return line ? line.name : '-';
  };

  // Get area name helper
  const getAreaName = (areaId) => {
    const area = areas.find(a => a.id === areaId);
    return area ? area.name : '-';
  };

  // Get manager name helper
  const getManagerName = (managerId) => {
    const manager = users.find(u => u.id === managerId);
    return manager ? manager.full_name : '-';
  };

  return (
    <Layout user={user} onLogout={onLogout}>
      <div className="p-4 lg:p-8 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl lg:text-4xl font-bold text-slate-900">{t('users')}</h1>
            <p className="text-slate-600 mt-1">{t('manageTeam')}</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Show Deleted Users Toggle */}
            <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 rounded-lg">
              <Label htmlFor="show-deleted" className="text-sm text-slate-600">Show Deleted</Label>
              <Switch
                id="show-deleted"
                checked={showDeletedUsers}
                onCheckedChange={setShowDeletedUsers}
              />
            </div>

            {/* CSV Import */}
            <input
              type="file"
              accept=".csv"
              ref={fileInputRef}
              onChange={handleImportCSV}
              className="hidden"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1"
            >
              <Upload className="h-4 w-4" />
              Import CSV
            </Button>

            {/* CSV Export */}
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportCSV}
              className="flex items-center gap-1"
            >
              <Download className="h-4 w-4" />
              Export CSV
            </Button>
          </div>
          <Dialog open={showDialog} onOpenChange={setShowDialog}>
            <DialogTrigger asChild>
              <Button data-testid="create-user-button" className="bg-primary hover:bg-primary/90 rounded-full">
                <Plus className="h-4 w-4 mr-2" />
                {t('addUser')}
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Add New User</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="username">Username *</Label>
                    <Input
                      id="username"
                      data-testid="user-username-input"
                      value={newUser.username}
                      onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="password">Password *</Label>
                    <Input
                      id="password"
                      data-testid="user-password-input"
                      type="password"
                      value={newUser.password}
                      onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                      required
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="full_name">Full Name *</Label>
                  <Input
                    id="full_name"
                    data-testid="user-fullname-input"
                    value={newUser.full_name}
                    onChange={(e) => setNewUser({ ...newUser, full_name: e.target.value })}
                    required
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      data-testid="user-email-input"
                      type="email"
                      value={newUser.email}
                      onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="phone">Phone</Label>
                    <Input
                      id="phone"
                      data-testid="user-phone-input"
                      value={newUser.phone}
                      onChange={(e) => setNewUser({ ...newUser, phone: e.target.value })}
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="role">Role *</Label>
                  <Select
                    value={newUser.role}
                    onValueChange={(value) => setNewUser({ ...newUser, role: value })}
                  >
                    <SelectTrigger data-testid="user-role-select">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {user?.role === 'super_admin' && <SelectItem value="super_admin">Super Admin</SelectItem>}
                      {(user?.role === 'super_admin' || user?.role === 'gm') && (
                        <SelectItem value="gm">General Manager</SelectItem>
                      )}
                      <SelectItem value="manager">Manager</SelectItem>
                      {(user?.role === 'super_admin' || user?.role === 'gm') && (
                        <SelectItem value="accountant">Accountant (حسابات)</SelectItem>
                      )}
                      <SelectItem value="medical_rep">Medical Rep</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="manager">Manager</Label>
                  <Select
                    value={newUser.manager_id || 'none'}
                    onValueChange={(value) => setNewUser({ ...newUser, manager_id: value === 'none' ? '' : value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="No Manager (User is a Manager)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No Manager</SelectItem>
                      {users.filter(u => u.role === 'manager' || u.role === 'gm' || u.role === 'super_admin').map((mgr) => (
                        <SelectItem key={mgr.id} value={mgr.id}>
                          {mgr.full_name} ({mgr.role})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="line">Line</Label>
                    <Select
                      value={newUser.line_id || 'none'}
                      onValueChange={(value) => setNewUser({ ...newUser, line_id: value === 'none' ? '' : value, area_id: '' })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select line (optional)" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No Line</SelectItem>
                        {lines.map((line) => (
                          <SelectItem key={line.id} value={line.id}>
                            {line.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="area">Area</Label>
                    <Select
                      value={newUser.area_id || 'none'}
                      onValueChange={(value) => setNewUser({ ...newUser, area_id: value === 'none' ? '' : value })}
                      disabled={!newUser.line_id}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select area (optional)" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No Area</SelectItem>
                        {areas.filter(a => a.line_id === newUser.line_id).map((area) => (
                          <SelectItem key={area.id} value={area.id}>
                            {area.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <Button
                  data-testid="user-submit-button"
                  type="submit"
                  className="w-full bg-primary hover:bg-primary/90 rounded-full"
                  disabled={loading}
                >
                  {loading ? 'Creating...' : 'Create User'}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* EDIT USER DIALOG */}
        <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Pencil className="h-5 w-5" />
                Edit User: {editingUser?.full_name}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleEditSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="edit_username">اسم المستخدم (Username) *</Label>
                  <Input
                    id="edit_username"
                    value={editForm.username}
                    onChange={(e) => setEditForm({ ...editForm, username: e.target.value })}
                    required
                    dir="ltr"
                    className="font-mono"
                  />
                </div>
                <div>
                  <Label htmlFor="edit_full_name">الاسم الكامل *</Label>
                  <Input
                    id="edit_full_name"
                    value={editForm.full_name}
                    onChange={(e) => setEditForm({ ...editForm, full_name: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="edit_email">Email</Label>
                  <Input
                    id="edit_email"
                    type="email"
                    value={editForm.email}
                    onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="edit_phone">Phone</Label>
                  <Input
                    id="edit_phone"
                    value={editForm.phone}
                    onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="edit_role">Role *</Label>
                <Select
                  value={editForm.role}
                  onValueChange={(value) => setEditForm({ ...editForm, role: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {user?.role === 'super_admin' && <SelectItem value="super_admin">Super Admin</SelectItem>}
                    {(user?.role === 'super_admin' || user?.role === 'gm') && (
                      <SelectItem value="gm">General Manager</SelectItem>
                    )}
                    <SelectItem value="manager">Manager</SelectItem>
                    {(user?.role === 'super_admin' || user?.role === 'gm') && (
                      <SelectItem value="accountant">Accountant (حسابات)</SelectItem>
                    )}
                    <SelectItem value="medical_rep">Medical Rep</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="edit_manager">Manager</Label>
                <Select
                  value={editForm.manager_id || 'none'}
                  onValueChange={(value) => setEditForm({ ...editForm, manager_id: value === 'none' ? '' : value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="No Manager" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No Manager</SelectItem>
                    {users.filter(u => u.id !== editingUser?.id && (u.role === 'manager' || u.role === 'gm' || u.role === 'super_admin')).map((mgr) => (
                      <SelectItem key={mgr.id} value={mgr.id}>
                        {mgr.full_name} ({mgr.role})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="edit_line">Line</Label>
                  <Select
                    value={editForm.line_id || 'none'}
                    onValueChange={(value) => setEditForm({ ...editForm, line_id: value === 'none' ? '' : value, area_id: '' })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select line" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No Line</SelectItem>
                      {lines.map((line) => (
                        <SelectItem key={line.id} value={line.id}>
                          {line.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="edit_area">Area</Label>
                  <Select
                    value={editForm.area_id || 'none'}
                    onValueChange={(value) => setEditForm({ ...editForm, area_id: value === 'none' ? '' : value })}
                    disabled={!editForm.line_id}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select area" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No Area</SelectItem>
                      {areas.filter(a => a.line_id === editForm.line_id).map((area) => (
                        <SelectItem key={area.id} value={area.id}>
                          {area.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="border-t pt-4 mt-4">
                <div className="flex items-center gap-2 mb-2">
                  <Key className="h-4 w-4 text-slate-500" />
                  <Label htmlFor="edit_password" className="font-medium">Change Password (Optional)</Label>
                </div>
                <Input
                  id="edit_password"
                  type="password"
                  placeholder="Leave empty to keep current password"
                  value={editForm.password}
                  onChange={(e) => setEditForm({ ...editForm, password: e.target.value })}
                />
                <p className="text-xs text-slate-500 mt-1">
                  Minimum 6 characters. Leave empty if you don't want to change the password.
                </p>
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setShowEditDialog(false)}>
                  Cancel
                </Button>
                <Button type="submit" className="bg-primary hover:bg-primary/90" disabled={loading}>
                  {loading ? 'Saving...' : 'Save Changes'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        <div className="grid grid-cols-1 gap-4">
          {users.length === 0 ? (
            <Card className="p-12 text-center border border-slate-200 rounded-xl">
              <UsersIcon className="h-16 w-16 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-500 text-lg">No users yet</p>
              <p className="text-slate-400 text-sm mt-2">Add team members to get started</p>
            </Card>
          ) : (
            users.map((u) => (
              <Card
                key={u.id}
                data-testid={`user-card-${u.id}`}
                className="p-6 border border-slate-200 rounded-xl shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4 flex-1">
                    <div className="w-12 h-12 bg-teal-50 rounded-full flex items-center justify-center">
                      <UsersIcon className="h-6 w-6 text-primary" />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-slate-900">{u.full_name}</h3>
                      <p className="text-sm text-slate-600 mb-2">@{u.username}</p>
                      <span className="status-badge info">{u.role?.replace('_', ' ')}</span>
                      <div className="flex flex-wrap gap-3 mt-3 text-sm text-slate-600">
                        {u.email && (
                          <div className="flex items-center gap-1">
                            <Mail className="h-4 w-4" />
                            {u.email}
                          </div>
                        )}
                        {u.phone && (
                          <div className="flex items-center gap-1">
                            <Phone className="h-4 w-4" />
                            {u.phone}
                          </div>
                        )}
                      </div>
                      {/* Show Line/Area/Manager info */}
                      <div className="flex flex-wrap gap-4 mt-2 text-xs text-slate-500">
                        {u.line_id && <span>Line: {getLineName(u.line_id)}</span>}
                        {u.area_id && <span>Area: {getAreaName(u.area_id)}</span>}
                        {u.manager_id && <span>Manager: {getManagerName(u.manager_id)}</span>}
                      </div>
                      {/* Last Login */}
                      {u.last_login && (
                        <p className="text-xs text-slate-400 mt-2 flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          Last login: {new Date(u.last_login).toLocaleString()}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 ml-4">
                    {/* Deleted User Indicator */}
                    {u.is_deleted && (
                      <span className="px-2 py-1 bg-red-100 text-red-700 text-xs font-medium rounded-full text-center">
                        Deleted
                      </span>
                    )}

                    {/* Edit Button */}
                    {!u.is_deleted && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEditClick(u)}
                        className="flex items-center gap-1"
                      >
                        <Pencil className="h-3 w-3" />
                        Edit
                      </Button>
                    )}

                    {/* Stats Button */}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleShowStats(u.id)}
                      className="flex items-center gap-1"
                    >
                      <BarChart3 className="h-3 w-3" />
                      Stats
                    </Button>

                    {/* Delete / Restore Button */}
                    {u.is_deleted ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleRestoreUser(u.id)}
                        className="flex items-center gap-1 text-green-600 hover:text-green-700 hover:bg-green-50"
                      >
                        <RotateCcw className="h-3 w-3" />
                        Restore
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setDeleteConfirmUser(u)}
                        className="flex items-center gap-1 text-red-600 hover:text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="h-3 w-3" />
                        Delete
                      </Button>
                    )}

                    {!u.is_deleted && (
                      <>
                        <div className="flex items-center gap-2">
                          <Label htmlFor={`access-${u.id}`} className="text-sm text-slate-600">
                            Access
                          </Label>
                          <Switch
                            id={`access-${u.id}`}
                            data-testid={`toggle-access-${u.id}`}
                            checked={u.is_active}
                            onCheckedChange={() => handleToggleAccess(u.id, u.is_active)}
                          />
                        </div>
                        {u.role === 'medical_rep' && (
                          <div className="flex items-center gap-2">
                            <Label htmlFor={`gps-${u.id}`} className="text-sm text-slate-600">
                              GPS
                            </Label>
                            <Switch
                              id={`gps-${u.id}`}
                              data-testid={`toggle-gps-${u.id}`}
                              checked={u.gps_enabled}
                              onCheckedChange={() => handleToggleGPS(u.id, u.gps_enabled)}
                            />
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </Card>
            ))
          )}
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteConfirmUser} onOpenChange={() => setDeleteConfirmUser(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete User</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{deleteConfirmUser?.full_name}</strong>?
              The user will be marked as deleted but can be restored later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => handleDeleteUser(deleteConfirmUser?.id)}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Stats Dialog */}
      <Dialog open={showStatsDialog} onOpenChange={setShowStatsDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-primary" />
              User Performance Statistics
            </DialogTitle>
          </DialogHeader>
          {userStats ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-blue-50 rounded-lg text-center">
                  <p className="text-2xl font-bold text-blue-700">{userStats.visits_count || 0}</p>
                  <p className="text-sm text-blue-600">Total Visits</p>
                </div>
                <div className="p-4 bg-teal-50 rounded-lg text-center">
                  <p className="text-2xl font-bold text-teal-700">{userStats.orders_count || 0}</p>
                  <p className="text-sm text-teal-600">Total Orders</p>
                </div>
                <div className="p-4 bg-orange-50 rounded-lg text-center">
                  <p className="text-2xl font-bold text-orange-700">{userStats.expenses_count || 0}</p>
                  <p className="text-sm text-orange-600">Total Expenses</p>
                </div>
                <div className="p-4 bg-green-50 rounded-lg text-center">
                  <p className="text-2xl font-bold text-green-700">
                    {new Intl.NumberFormat('en-EG', { style: 'currency', currency: 'EGP' }).format(userStats.total_orders_amount || 0)}
                  </p>
                  <p className="text-sm text-green-600">Orders Value</p>
                </div>
              </div>
              <div className="p-4 bg-purple-50 rounded-lg text-center">
                <p className="text-2xl font-bold text-purple-700">
                  {new Intl.NumberFormat('en-EG', { style: 'currency', currency: 'EGP' }).format(userStats.total_expenses_amount || 0)}
                </p>
                <p className="text-sm text-purple-600">Total Expenses Amount</p>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Layout>
  );
};

export default Users;