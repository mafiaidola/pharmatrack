import React, { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '../components/ui/alert-dialog';
import { Plus, MapPin, CheckCircle, Clock, Edit, Trash2, Star, LayoutGrid, List, AlignJustify, Eye, X } from 'lucide-react';
import { toast } from 'sonner';
import api from '../utils/api';
import { getHighAccuracyLocation } from '../utils/gps';
import { format } from 'date-fns';
import { useLanguage } from '../contexts/LanguageContext';

const Visits = ({ user, onLogout }) => {
  const { t } = useLanguage();
  const [visits, setVisits] = useState([]);
  const [clinics, setClinics] = useState([]);
  const [products, setProducts] = useState([]);
  const [showDialog, setShowDialog] = useState(false);
  const [editingVisit, setEditingVisit] = useState(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [visitToDelete, setVisitToDelete] = useState(null);
  const [viewMode, setViewMode] = useState('grid'); // 'grid', 'list', 'detailed'
  const [selectedVisit, setSelectedVisit] = useState(null); // For details modal
  const [formData, setFormData] = useState({
    clinic_id: '',
    visit_reason: '',
    visit_result: '',
    notes: '',
    attendees: '',
    samples_provided: [],
    follow_up_date: '',
    visit_rating: 0,
    latitude: null,
    longitude: null,
    status: 'completed',
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchVisits();
    fetchClinics();
    fetchProducts();
  }, []);

  const fetchVisits = async () => {
    try {
      const response = await api.get('/visits');
      setVisits(response.data);
    } catch (error) {
      toast.error('Failed to load visits');
    }
  };

  const fetchClinics = async () => {
    try {
      const response = await api.get('/clinics');
      setClinics(response.data.items || response.data);
    } catch (error) {
      toast.error('Failed to load clinics');
    }
  };

  const fetchProducts = async () => {
    try {
      const response = await api.get('/products');
      setProducts(response.data.items || response.data);
    } catch (error) {
      console.error('Failed to load products');
    }
  };

  const resetForm = () => {
    setFormData({
      clinic_id: '',
      visit_reason: '',
      visit_result: '',
      notes: '',
      attendees: '',
      samples_provided: [],
      follow_up_date: '',
      visit_rating: 0,
      latitude: null,
      longitude: null,
      status: 'completed',
    });
    setEditingVisit(null);
  };

  const handleEdit = (visit) => {
    setEditingVisit(visit);
    setFormData({
      clinic_id: visit.clinic_id,
      visit_reason: visit.visit_reason || '',
      visit_result: visit.visit_result || '',
      notes: visit.notes || '',
      attendees: visit.attendees || '',
      samples_provided: visit.samples_provided || [],
      follow_up_date: visit.follow_up_date ? new Date(visit.follow_up_date).toISOString().slice(0, 16) : '',
      visit_rating: visit.visit_rating || 0,
      latitude: visit.latitude,
      longitude: visit.longitude,
      status: visit.status,
    });
    setShowDialog(true);
  };

  const handleDeleteClick = (visit) => {
    setVisitToDelete(visit);
    setDeleteDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!visitToDelete) return;

    try {
      await api.delete(`/visits/${visitToDelete.id}`);
      toast.success('Visit deleted successfully');
      setDeleteDialogOpen(false);
      setVisitToDelete(null);
      fetchVisits();
    } catch (error) {
      toast.error('Failed to delete visit');
    }
  };

  const addSample = () => {
    setFormData({
      ...formData,
      samples_provided: [...formData.samples_provided, { product_id: '', quantity: 1 }]
    });
  };

  const removeSample = (index) => {
    setFormData({
      ...formData,
      samples_provided: formData.samples_provided.filter((_, i) => i !== index)
    });
  };

  const updateSample = (index, field, value) => {
    const updated = formData.samples_provided.map((sample, i) =>
      i === index ? { ...sample, [field]: value } : sample
    );
    setFormData({ ...formData, samples_provided: updated });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    // Silent high-accuracy GPS capture in background
    let latitude = null;
    let longitude = null;
    try {
      const location = await getHighAccuracyLocation({
        targetAccuracy: 10,
        maxAttempts: 3
      });
      latitude = location.latitude;
      longitude = location.longitude;
    } catch {
      // Silent fail - continue without location
    }

    const submitData = {
      ...formData,
      latitude,
      longitude,
      follow_up_date: formData.follow_up_date ? new Date(formData.follow_up_date).toISOString() : null,
      samples_provided: formData.samples_provided.map(s => ({
        product_id: s.product_id,
        product_name: products.find(p => p.id === s.product_id)?.name || '',
        quantity: parseInt(s.quantity)
      }))
    };

    try {
      if (editingVisit) {
        await api.put(`/visits/${editingVisit.id}`, submitData);
        toast.success('Visit updated successfully');
      } else {
        await api.post('/visits', submitData);
        toast.success('Visit logged successfully');
      }
      setShowDialog(false);
      resetForm();
      fetchVisits();
    } catch (error) {
      toast.error(editingVisit ? 'Failed to update visit' : 'Failed to log visit');
    } finally {
      setLoading(false);
    }
  };

  const handleDialogClose = (open) => {
    setShowDialog(open);
    if (!open) {
      resetForm();
    }
  };

  // Helper to get color classes based on status logic
  const getStatusColor = (visit) => {
    if (visit.is_verified) return { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-700', icon: 'text-green-600' };
    if (visit.status === 'completed') return { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700', icon: 'text-blue-600' };
    if (visit.status === 'planned') return { bg: 'bg-yellow-50', border: 'border-yellow-200', text: 'text-yellow-700', icon: 'text-yellow-600' };
    if (visit.status === 'cancelled') return { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700', icon: 'text-red-600' };
    return { bg: 'bg-slate-50', border: 'border-slate-200', text: 'text-slate-700', icon: 'text-slate-600' };
  };

  const renderVisitCard = (visit) => {
    const clinic = clinics.find((c) => c.id === visit.clinic_id);
    const colors = getStatusColor(visit);

    // Grid View Card
    if (viewMode === 'grid') {
      return (
        <Card
          key={visit.id}
          className={`group cursor-pointer hover:shadow-lg transition-all duration-200 border-2 ${colors.border} ${colors.bg}`}
          onClick={() => setSelectedVisit(visit)}
        >
          <div className="p-5 space-y-4">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="font-bold text-slate-900 line-clamp-1">{clinic?.name || 'Unknown Clinic'}</h3>
                <p className={`text-sm font-medium mt-1 ${colors.text} flex items-center gap-1`}>
                  {visit.is_verified ? <CheckCircle className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                  {visit.is_verified ? 'Verified' : visit.status.charAt(0).toUpperCase() + visit.status.slice(1)}
                </p>
              </div>
              <div className="w-10 h-10 rounded-full bg-white/60 flex items-center justify-center shadow-sm">
                <MapPin className={`h-5 w-5 ${colors.icon}`} />
              </div>
            </div>

            <div className="space-y-2 text-sm text-slate-600">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 opacity-70" />
                <span>{format(new Date(visit.visit_date), 'PPp')}</span>
              </div>
              <div className="flex items-center gap-2">
                <Star className="h-4 w-4 opacity-70 text-yellow-500" />
                <span>Result: {visit.visit_result?.replace('_', ' ') || 'N/A'}</span>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-200/50 flex justify-between items-center">
              <span className="text-xs text-slate-500 font-medium tracking-wide">CLICK FOR DETAILS</span>
              <Eye className="h-4 w-4 text-slate-400 group-hover:text-primary transition-colors" />
            </div>
          </div>
        </Card>
      );
    }

    // List View Card (Compact)
    if (viewMode === 'list') {
      return (
        <div
          key={visit.id}
          onClick={() => setSelectedVisit(visit)}
          className={`flex items-center gap-4 p-4 rounded-xl border ${colors.border} ${colors.bg} cursor-pointer hover:shadow-md transition-all`}
        >
          <div className={`p-3 rounded-full bg-white/60 shadow-sm`}>
            <MapPin className={`h-5 w-5 ${colors.icon}`} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-slate-900 truncate">{clinic?.name || 'Unknown Clinic'}</h3>
            <p className="text-sm text-slate-500">{format(new Date(visit.visit_date), 'PPp')}</p>
          </div>

          <div className="hidden sm:block text-right">
            <p className={`text-sm font-medium ${colors.text}`}>
              {visit.is_verified ? 'Verified' : visit.status}
            </p>
            <p className="text-xs text-slate-500">
              {visit.visit_result?.replace('_', ' ')}
            </p>
          </div>

          <Eye className="h-5 w-5 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
      );
    }

    // Detailed View (Expanded Row)
    return (
      <div
        key={visit.id}
        className={`p-6 rounded-xl border-l-4 ${colors.border.replace('border-', 'border-l-')} bg-white shadow-sm hover:shadow-md transition-all cursor-pointer space-y-4`}
        onClick={() => setSelectedVisit(visit)}
      >
        <div className="flex justify-between items-start">
          <div className="flex items-start gap-4">
            <div className={`w-12 h-12 rounded-lg ${colors.bg} flex items-center justify-center`}>
              <MapPin className={`h-6 w-6 ${colors.icon}`} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">{clinic?.name || 'Unknown Clinic'}</h3>
              <div className="flex items-center gap-3 mt-1 text-sm text-slate-600">
                <span>{format(new Date(visit.visit_date), 'PPp')}</span>
                <span>•</span>
                <span className="font-medium">{visit.visit_reason?.replace('_', ' ')}</span>
              </div>
            </div>
          </div>
          <div className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide ${colors.bg} ${colors.text}`}>
            {visit.is_verified ? 'Verified Visit' : visit.status}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 pl-16">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase">Outcome</p>
            <p className="text-slate-900 mt-1">{visit.visit_result?.replace('_', ' ')}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase">Attendees</p>
            <p className="text-slate-900 mt-1">{visit.attendees || '-'}</p>
          </div>
          {visit.visit_rating > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase">Rating</p>
              <div className="flex gap-0.5 mt-1">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} className={`h-4 w-4 ${i < visit.visit_rating ? 'fill-yellow-400 text-yellow-400' : 'text-slate-200'}`} />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <Layout user={user} onLogout={onLogout}>
      <div className="p-4 lg:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl lg:text-4xl font-bold text-slate-900">{t('visitsReference')}</h1>
            <p className="text-slate-600 mt-1">{t('manageFieldVisits')}</p>
          </div>

          <div className="flex items-center gap-2">
            {/* View Switcher */}
            <div className="flex bg-slate-100 p-1 rounded-lg">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-2 rounded-md transition-all ${viewMode === 'grid' ? 'bg-white shadow-sm text-primary' : 'text-slate-500 hover:text-slate-700'}`}
                title="Grid View"
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`p-2 rounded-md transition-all ${viewMode === 'list' ? 'bg-white shadow-sm text-primary' : 'text-slate-500 hover:text-slate-700'}`}
                title="List View"
              >
                <List className="h-4 w-4" />
              </button>
              <button
                onClick={() => setViewMode('detailed')}
                className={`p-2 rounded-md transition-all ${viewMode === 'detailed' ? 'bg-white shadow-sm text-primary' : 'text-slate-500 hover:text-slate-700'}`}
                title="Detailed View"
              >
                <AlignJustify className="h-4 w-4" />
              </button>
            </div>

            {user?.role !== 'manager' && (
              <Dialog open={showDialog} onOpenChange={handleDialogClose}>
                <DialogTrigger asChild>
                  <Button className="bg-primary hover:bg-primary/90 rounded-full shadow-lg shadow-primary/20">
                    <Plus className="h-4 w-4 mr-2" />
                    {t('logVisit')}
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>{editingVisit ? t('editVisit') : t('logNewVisit')}</DialogTitle>
                  </DialogHeader>
                  {/* Form Component Logic (Same as before but cleaner) */}
                  <form onSubmit={handleSubmit} className="space-y-4">
                    {/* Clinic Select */}
                    <div>
                      <Label htmlFor="clinic">Clinic *</Label>
                      <Select
                        value={formData.clinic_id}
                        onValueChange={(value) => {
                          setFormData({ ...formData, clinic_id: value });
                          setLocationVerified(false);
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select clinic" />
                        </SelectTrigger>
                        <SelectContent>
                          {clinics.map((clinic) => (
                            <SelectItem key={clinic.id} value={clinic.id}>
                              {clinic.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Reason & Result Grid */}
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="visit_reason">Visit Reason *</Label>
                        <Select
                          value={formData.visit_reason}
                          onValueChange={(value) => setFormData({ ...formData, visit_reason: value })}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select reason" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="follow_up">Maint. / Follow Up</SelectItem>
                            <SelectItem value="new_product">New Product Launch</SelectItem>
                            <SelectItem value="product_demo">Product Demo</SelectItem>
                            <SelectItem value="place_order">Place Order</SelectItem>
                            <SelectItem value="issue">Issue Resolution</SelectItem>
                            <SelectItem value="opening_clinic">Clinic Opening</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div>
                        <Label htmlFor="visit_result">Visit Result *</Label>
                        <Select
                          value={formData.visit_result}
                          onValueChange={(value) => setFormData({ ...formData, visit_result: value })}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select result" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="successful">Successful</SelectItem>
                            <SelectItem value="doctor_interested">Doctor Interested</SelectItem>
                            <SelectItem value="needs_follow_up">Needs Follow Up</SelectItem>
                            <SelectItem value="responsible_absent">Person Absent</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {/* Attendees */}
                    <div>
                      <Label htmlFor="attendees">Attendees</Label>
                      <Input
                        id="attendees"
                        value={formData.attendees}
                        onChange={(e) => setFormData({ ...formData, attendees: e.target.value })}
                        placeholder="e.g., Dr. Ahmed, Head Nurse"
                      />
                    </div>

                    {/* Samples Section */}
                    <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                      <div className="flex items-center justify-between mb-3">
                        <Label>Samples Provided</Label>
                        <Button type="button" variant="outline" size="sm" onClick={addSample} className="text-xs h-8">
                          <Plus className="h-3 w-3 mr-1" /> Add Sample
                        </Button>
                      </div>
                      {formData.samples_provided.length === 0 && <p className="text-xs text-slate-400 italic">No samples added</p>}
                      {formData.samples_provided.map((sample, idx) => (
                        <div key={idx} className="flex gap-2 mb-2 items-center">
                          <Select
                            value={sample.product_id}
                            onValueChange={(value) => updateSample(idx, 'product_id', value)}
                          >
                            <SelectTrigger className="flex-1 bg-white">
                              <SelectValue placeholder="Product" />
                            </SelectTrigger>
                            <SelectContent>
                              {products.map((product) => (
                                <SelectItem key={product.id} value={product.id}>
                                  {product.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Input
                            type="number"
                            min="1"
                            value={sample.quantity}
                            onChange={(e) => updateSample(idx, 'quantity', e.target.value)}
                            className="w-20 bg-white"
                            placeholder="Qty"
                          />
                          <Button type="button" variant="ghost" size="icon" onClick={() => removeSample(idx)} className="h-8 w-8 text-red-500 hover:bg-red-50">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>

                    {/* Follow Up & Rating */}
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Follow-up Date</Label>
                        <Input
                          type="datetime-local"
                          value={formData.follow_up_date}
                          onChange={(e) => setFormData({ ...formData, follow_up_date: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label>Visit Rating</Label>
                        <div className="flex gap-1 mt-2">
                          {[1, 2, 3, 4, 5].map((rating) => (
                            <button
                              key={rating}
                              type="button"
                              onClick={() => setFormData({ ...formData, visit_rating: rating })}
                              className="focus:outline-none transition-transform hover:scale-110"
                            >
                              <Star
                                className={`h-6 w-6 ${formData.visit_rating >= rating ? 'fill-yellow-400 text-yellow-400' : 'text-slate-200'}`}
                              />
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Notes */}
                    <div>
                      <Label htmlFor="notes">Notes</Label>
                      <Textarea
                        id="notes"
                        value={formData.notes}
                        onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                        placeholder="Key takeaways, doctor feedback, etc."
                        rows={3}
                      />
                    </div>

                    <Button
                      type="submit"
                      className="w-full bg-primary hover:bg-primary/90 rounded-full h-11"

                      disabled={loading || !formData.clinic_id || !formData.visit_reason}
                    >
                      {loading ? 'Processing...' : (editingVisit ? 'Update Visit Log' : 'Log Visit')}
                    </Button>
                  </form>
                </DialogContent>
              </Dialog>
            )}
          </div>
        </div>

        {/* Content Area Rendering based on ViewMode */}
        <div className={viewMode === 'grid' ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4' : 'space-y-3'}>
          {visits.length === 0 ? (
            <div className="col-span-full py-12 text-center bg-white rounded-xl border border-dashed border-slate-300">
              <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <MapPin className="h-8 w-8 text-slate-300" />
              </div>
              <h3 className="text-lg font-medium text-slate-900">{t('noVisitsRecorded')}</h3>
              <p className="text-slate-500">{t('logFirstVisit')}</p>
            </div>
          ) : (
            visits.map(renderVisitCard)
          )}
        </div>
      </div>

      {/* Details Modal */}
      <Dialog open={!!selectedVisit} onOpenChange={(open) => !open && setSelectedVisit(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {t('visitDetails')}
              {selectedVisit?.is_verified && <CheckCircle className="h-5 w-5 text-green-500" />}
            </DialogTitle>
          </DialogHeader>

          {selectedVisit && (
            <div className="space-y-6">
              <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-lg border border-slate-100">
                <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-sm">
                  <MapPin className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h3 className="font-bold text-lg text-slate-900">
                    {clinics.find(c => c.id === selectedVisit.clinic_id)?.name || 'Unknown Clinic'}
                  </h3>
                  <p className="text-sm text-slate-500">{format(new Date(selectedVisit.visit_date), 'PPpp')}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs text-slate-500 uppercase">Reason</Label>
                  <p className="font-medium text-slate-800 mt-1">{selectedVisit.visit_reason?.replace('_', ' ')}</p>
                </div>
                <div>
                  <Label className="text-xs text-slate-500 uppercase">Result</Label>
                  <p className="font-medium text-slate-800 mt-1">{selectedVisit.visit_result?.replace('_', ' ')}</p>
                </div>
                <div>
                  <Label className="text-xs text-slate-500 uppercase">Attendees</Label>
                  <p className="font-medium text-slate-800 mt-1">{selectedVisit.attendees || 'None logged'}</p>
                </div>
                <div>
                  <Label className="text-xs text-slate-500 uppercase">Rating</Label>
                  <div className="flex mt-1">
                    {[...Array(5)].map((_, i) => (
                      <Star key={i} className={`h-4 w-4 ${i < selectedVisit.visit_rating ? 'fill-yellow-400 text-yellow-400' : 'text-slate-200'}`} />
                    ))}
                  </div>
                </div>
              </div>

              {selectedVisit.samples_provided?.length > 0 && (
                <div>
                  <Label className="text-xs text-slate-500 uppercase mb-2 block">Samples Provided</Label>
                  <div className="space-y-2">
                    {selectedVisit.samples_provided.map((sample, idx) => (
                      <div key={idx} className="flex justify-between items-center p-2 bg-slate-50 rounded border border-slate-100 text-sm">
                        <span>{sample.product_name}</span>
                        <span className="font-bold">x {sample.quantity}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selectedVisit.notes && (
                <div>
                  <Label className="text-xs text-slate-500 uppercase">Notes</Label>
                  <p className="text-sm text-slate-600 mt-1 bg-yellow-50/50 p-3 rounded-lg border border-yellow-100 leading-relaxed">
                    {selectedVisit.notes}
                  </p>
                </div>
              )}

              <div className="flex gap-3 pt-4 border-t border-slate-100">
                {(user?.role === 'medical_rep' || user?.role === 'gm' || user?.role === 'super_admin') && (
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => {
                      handleEdit(selectedVisit);
                      setSelectedVisit(null);
                    }}
                  >
                    <Edit className="h-4 w-4 mr-2" />
                    Edit Visit
                  </Button>
                )}
                <Button
                  variant="ghost"
                  className="flex-1 text-slate-500"
                  onClick={() => setSelectedVisit(null)}
                >
                  Close
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Alert - kept separate to avoid nesting issues */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('deleteVisitRecord')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('confirmDeleteVisit')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Layout>
  );
};

export default Visits;