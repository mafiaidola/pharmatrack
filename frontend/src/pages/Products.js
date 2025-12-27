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
import { Plus, Package, Edit, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import api from '../utils/api';
import { useLanguage } from '../contexts/LanguageContext';

const Products = ({ user, onLogout }) => {
  const { formatCurrency } = useLanguage();
  const [products, setProducts] = useState([]);
  const [lines, setLines] = useState([]);
  const [showDialog, setShowDialog] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [productToDelete, setProductToDelete] = useState(null);
  const [formData, setFormData] = useState({
    line_id: '',
    name: '',
    sku: '',
    price: '',
    description: '',
    stock_quantity: '',
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchProducts();
    fetchLines();
  }, []);

  const fetchProducts = async () => {
    try {
      const response = await api.get('/products');
      setProducts(response.data.items || response.data);
    } catch (error) {
      toast.error('Failed to load products');
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

  const resetForm = () => {
    setFormData({
      line_id: '',
      name: '',
      sku: '',
      price: '',
      description: '',
      stock_quantity: '',
    });
    setEditingProduct(null);
  };

  const handleEdit = (product) => {
    setEditingProduct(product);
    setFormData({
      line_id: product.line_id,
      name: product.name,
      sku: product.sku || '',
      price: product.price.toString(),
      description: product.description || '',
      stock_quantity: product.stock_quantity?.toString() || '0',
    });
    setShowDialog(true);
  };

  const handleDeleteClick = (product) => {
    setProductToDelete(product);
    setDeleteDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!productToDelete) return;

    try {
      await api.delete(`/products/${productToDelete.id}`);
      toast.success('Product deleted successfully');
      setDeleteDialogOpen(false);
      setProductToDelete(null);
      fetchProducts();
    } catch (error) {
      toast.error('Failed to delete product');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    const productData = {
      ...formData,
      price: parseFloat(formData.price),
      stock_quantity: parseInt(formData.stock_quantity) || 0,
    };

    try {
      if (editingProduct) {
        await api.put(`/products/${editingProduct.id}`, productData);
        toast.success('Product updated successfully');
      } else {
        await api.post('/products', productData);
        toast.success('Product created successfully');
      }
      setShowDialog(false);
      resetForm();
      fetchProducts();
    } catch (error) {
      toast.error(editingProduct ? 'Failed to update product' : 'Failed to create product');
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

  const getLineName = (lineId) => {
    const line = lines.find((l) => l.id === lineId);
    return line ? line.name : 'Unknown Line';
  };

  return (
    <Layout user={user} onLogout={onLogout}>
      <div className="p-4 lg:p-8 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl lg:text-4xl font-bold text-slate-900">Products</h1>
            <p className="text-slate-600 mt-1">Manage product catalog</p>
          </div>
          <Dialog open={showDialog} onOpenChange={handleDialogClose}>
            <DialogTrigger asChild>
              <Button className="bg-primary hover:bg-primary/90 rounded-full">
                <Plus className="h-4 w-4 mr-2" />
                Add Product
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>{editingProduct ? 'Edit Product' : 'Add Product'}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label htmlFor="line">Line *</Label>
                  <Select
                    value={formData.line_id}
                    onValueChange={(value) => setFormData({ ...formData, line_id: value })}
                    disabled={!!editingProduct}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select line" />
                    </SelectTrigger>
                    <SelectContent>
                      {lines.map((line) => (
                        <SelectItem key={line.id} value={line.id}>
                          {line.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="name">Product Name *</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="e.g., Vitamin C Serum"
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="sku">SKU</Label>
                    <Input
                      id="sku"
                      value={formData.sku}
                      onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                      placeholder="e.g., VIT-C-001"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="price">Price *</Label>
                    <Input
                      id="price"
                      type="number"
                      step="0.01"
                      value={formData.price}
                      onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                      placeholder="0.00"
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="stock">Stock Quantity</Label>
                    <Input
                      id="stock"
                      type="number"
                      value={formData.stock_quantity}
                      onChange={(e) => setFormData({ ...formData, stock_quantity: e.target.value })}
                      placeholder="0"
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Product description..."
                    rows={3}
                  />
                </div>

                <Button
                  type="submit"
                  className="w-full bg-primary hover:bg-primary/90 rounded-full"
                  disabled={loading || !formData.line_id || !formData.name || !formData.price}
                >
                  {loading ? (editingProduct ? 'Updating...' : 'Creating...') : (editingProduct ? 'Update Product' : 'Create Product')}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {products.length === 0 ? (
            <Card className="col-span-full p-12 text-center border border-slate-200 rounded-xl">
              <Package className="h-16 w-16 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-500 text-lg">No products yet</p>
              <p className="text-slate-400 text-sm mt-2">Add your first product to the catalog</p>
            </Card>
          ) : (
            products.map((product) => (
              <Card
                key={product.id}
                className="p-6 border border-slate-200 rounded-xl shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Package className="h-5 w-5 text-primary" />
                      <h3 className="text-lg font-semibold text-slate-900">{product.name}</h3>
                    </div>
                    {product.sku && (
                      <p className="text-xs text-slate-500 font-mono">{product.sku}</p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleEdit(product)}
                      className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDeleteClick(product)}
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-slate-600">Line:</span>
                    <span className="text-sm font-medium text-slate-900">{getLineName(product.line_id)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-slate-600">Price:</span>
                    <span className="text-lg font-bold text-slate-900">{formatCurrency(product.price)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-slate-600">Stock:</span>
                    <span className={`text-sm font-medium ${product.stock_quantity > 10 ? 'text-green-600' : 'text-orange-600'}`}>
                      {product.stock_quantity} units
                    </span>
                  </div>
                </div>

                {product.description && (
                  <p className="text-sm text-slate-600 mt-3 p-3 bg-slate-50 rounded-lg line-clamp-2">
                    {product.description}
                  </p>
                )}
              </Card>
            ))
          )}
        </div>
      </div>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Product</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this product? This action cannot be undone.
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

export default Products;
