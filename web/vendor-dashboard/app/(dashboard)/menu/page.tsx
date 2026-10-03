'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { Minus, Pencil, Plus, Trash2, UtensilsCrossed } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  InlineError,
  Input,
  LoadingBlock,
  Modal,
  PageHeader,
  Select,
  Textarea,
  Toggle,
  api,
  centsToInput,
  formatMoney,
  parseMoneyToCents,
  useApi,
  useToast,
  type MenuSection,
  type Product,
} from '@doorstep/web-shared';
import { ImageUpload } from '@/components/ImageUpload';

export default function MenuPage() {
  const toast = useToast();
  const sections = useApi<MenuSection[]>('/vendor/sections');
  const products = useApi<Product[]>('/vendor/products');
  const [activeSection, setActiveSection] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Product | 'new' | null>(null);
  const [sectionModal, setSectionModal] = useState<MenuSection | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Product | null>(null);

  const visible = useMemo(() => {
    const list = products.data ?? [];
    return list.filter(
      (p) =>
        (activeSection === 'all' || (activeSection === 'none' ? !p.sectionId : p.sectionId === activeSection)) &&
        (!search || p.name.toLowerCase().includes(search.toLowerCase())),
    );
  }, [products.data, activeSection, search]);

  const replaceProduct = (p: Product) =>
    products.setData((prev) => {
      const list = prev ?? [];
      return list.some((x) => x.id === p.id) ? list.map((x) => (x.id === p.id ? { ...x, ...p, rawStockQty: p.stockQty ?? x.rawStockQty, rawIsAvailable: p.isAvailable } : x)) : [...list, p];
    });

  const patchProduct = async (p: Product, body: Record<string, unknown>, message: string) => {
    try {
      replaceProduct(await api<Product>(`/vendor/products/${p.id}`, { method: 'PATCH', body }));
      toast(message);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Update failed', 'error');
    }
  };

  const adjustStock = async (p: Product, delta: number) => {
    try {
      replaceProduct(await api<Product>(`/vendor/products/${p.id}/stock`, { body: { delta } }));
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Stock update failed', 'error');
    }
  };

  if ((sections.loading && !sections.data) || (products.loading && !products.data)) return <LoadingBlock label="Loading menu…" variant="list" />;
  if (sections.error || products.error) {
    return (
      <ErrorState
        message={(sections.error ?? products.error)!.message}
        onRetry={() => {
          void sections.reload();
          void products.reload();
        }}
      />
    );
  }

  const sectionList = sections.data ?? [];
  const sectionName = (id: string | null) => sectionList.find((s) => s.id === id)?.name ?? 'Unsectioned';

  return (
    <div>
      <PageHeader
        title="Products & stock"
        subtitle="Products, prices and stock levels customers see in the app."
        actions={
          <>
            <Button variant="secondary" onClick={() => setSectionModal('new')} icon={<Plus className="h-4 w-4" />}>
              Section
            </Button>
            <Button onClick={() => setEditing('new')} icon={<Plus className="h-4 w-4" />}>
              Add product
            </Button>
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
        <Card className="h-fit p-3">
          <p className="px-2 pb-2 text-xs font-semibold uppercase tracking-wide text-muted">Sections</p>
          <ul className="space-y-1">
            {[{ id: 'all', name: 'All products' }, ...sectionList, { id: 'none', name: 'Unsectioned' }].map((s) => (
              <li key={s.id} className="group flex items-center">
                <button
                  type="button"
                  onClick={() => setActiveSection(s.id)}
                  className={`flex-1 truncate rounded-lg px-2 py-1.5 text-left text-sm font-semibold ${activeSection === s.id ? 'bg-brand-light text-brand' : 'hover:bg-canvas'}`}
                >
                  {s.name}
                </button>
                {'sortOrder' in s ? (
                  <button type="button" className="rounded p-1 text-muted opacity-0 group-hover:opacity-100" onClick={() => setSectionModal(s as MenuSection)} aria-label={`Edit ${s.name}`}>
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </Card>

        <div>
          <Input placeholder="Search products…" value={search} onChange={(e) => setSearch(e.target.value)} className="mb-4 max-w-sm" />
          {visible.length === 0 ? (
            <EmptyState
              icon={<UtensilsCrossed className="h-9 w-9" />}
              title="No products yet"
              message="Add your first product so customers can order from you."
              action={<Button onClick={() => setEditing('new')}>Add product</Button>}
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {visible.map((p) => {
                const available = p.rawIsAvailable ?? p.isAvailable;
                const stock = p.rawStockQty ?? p.stockQty ?? 0;
                return (
                  <Card key={p.id} className="flex flex-col p-4">
                    <div className="flex gap-3">
                      {p.thumbUrl || p.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.thumbUrl ?? p.imageUrl ?? ''} alt={p.name} className="h-16 w-16 shrink-0 rounded-xl object-cover" />
                      ) : (
                        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-brand-light text-brand">
                          <UtensilsCrossed className="h-6 w-6" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold">{p.name}</p>
                        <p className="text-xs text-muted">{sectionName(p.sectionId)}</p>
                        <p className="mt-1 font-bold text-brand">{formatMoney(p.priceCents)}</p>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center justify-between">
                      <Toggle checked={available} onChange={(v) => void patchProduct(p, { isAvailable: v }, v ? `${p.name} is available` : `${p.name} hidden`)} label={available ? 'Available' : 'Unavailable'} />
                      {p.trackStock ? (
                        <div className="flex items-center gap-1">
                          <button type="button" className="rounded-lg border border-line p-1 disabled:opacity-40" disabled={stock <= 0} onClick={() => void adjustStock(p, -1)} aria-label="Decrease stock">
                            <Minus className="h-3.5 w-3.5" />
                          </button>
                          <Badge tone={stock === 0 ? 'red' : stock < 5 ? 'yellow' : 'green'}>{stock} in stock</Badge>
                          <button type="button" className="rounded-lg border border-line p-1" onClick={() => void adjustStock(p, 1)} aria-label="Increase stock">
                            <Plus className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-muted">Stock not tracked</span>
                      )}
                    </div>
                    <div className="mt-3 flex gap-2 border-t border-line pt-3">
                      <Button variant="secondary" size="sm" className="flex-1" icon={<Pencil className="h-4 w-4" />} onClick={() => setEditing(p)}>
                        Edit
                      </Button>
                      <Button variant="ghost" size="sm" icon={<Trash2 className="h-4 w-4" />} onClick={() => setDeleting(p)} aria-label={`Delete ${p.name}`} />
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {editing ? (
        <ProductModal
          product={editing === 'new' ? null : editing}
          sections={sectionList}
          defaultSection={activeSection !== 'all' && activeSection !== 'none' ? activeSection : null}
          onClose={() => setEditing(null)}
          onSaved={(p) => {
            replaceProduct(p);
            setEditing(null);
            toast(`${p.name} saved`);
          }}
        />
      ) : null}

      {sectionModal ? (
        <SectionModal
          section={sectionModal === 'new' ? null : sectionModal}
          onClose={() => setSectionModal(null)}
          onSaved={() => {
            setSectionModal(null);
            void sections.reload();
            void products.reload();
          }}
        />
      ) : null}

      <Modal
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        title="Delete product?"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={async () => {
                if (!deleting) return;
                try {
                  await api(`/vendor/products/${deleting.id}`, { method: 'DELETE' });
                  products.setData((prev) => (prev ?? []).filter((x) => x.id !== deleting.id));
                  toast(`${deleting.name} deleted`);
                } catch (err) {
                  toast(err instanceof Error ? err.message : 'Delete failed', 'error');
                }
                setDeleting(null);
              }}
            >
              Delete
            </Button>
          </>
        }
      >
        <p className="text-sm">
          <strong>{deleting?.name}</strong> will be removed from your menu. Past orders keep their details.
        </p>
      </Modal>
    </div>
  );
}

function ProductModal({
  product,
  sections,
  defaultSection,
  onClose,
  onSaved,
}: {
  product: Product | null;
  sections: MenuSection[];
  defaultSection: string | null;
  onClose: () => void;
  onSaved: (p: Product) => void;
}) {
  const [name, setName] = useState(product?.name ?? '');
  const [description, setDescription] = useState(product?.description ?? '');
  const [price, setPrice] = useState(centsToInput(product?.priceCents));
  const [sectionId, setSectionId] = useState<string>(product?.sectionId ?? defaultSection ?? '');
  const [imageUrl, setImageUrl] = useState<string | null>(product?.imageUrl ?? null);
  const [thumbUrl, setThumbUrl] = useState<string | null>(product?.thumbUrl ?? null);
  const [isAvailable, setIsAvailable] = useState(product?.rawIsAvailable ?? product?.isAvailable ?? true);
  const [trackStock, setTrackStock] = useState(product?.trackStock ?? false);
  const [stockQty, setStockQty] = useState(String(product?.rawStockQty ?? product?.stockQty ?? 0));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const priceCents = parseMoneyToCents(price);
    if (!priceCents || priceCents < 1) return setError('Enter a valid price, e.g. 5.50');
    const qty = Number(stockQty);
    if (trackStock && (!Number.isInteger(qty) || qty < 0)) return setError('Stock must be a whole number');
    setPending(true);
    setError(null);
    const body = {
      name: name.trim(),
      description: description.trim() || undefined,
      priceCents,
      sectionId: sectionId || null,
      imageUrl,
      thumbUrl,
      isAvailable,
      trackStock,
      stockQty: trackStock ? qty : 0,
    };
    try {
      const saved = product
        ? await api<Product>(`/vendor/products/${product.id}`, { method: 'PATCH', body })
        : await api<Product>('/vendor/products', { body });
      onSaved({ ...saved, rawIsAvailable: isAvailable, rawStockQty: trackStock ? qty : 0 });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save product');
    } finally {
      setPending(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={product ? `Edit ${product.name}` : 'Add product'}>
      <form id="product-form" onSubmit={submit} className="space-y-4">
        <Field label="Name">
          <Input required maxLength={100} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Description">
          <Textarea maxLength={500} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Price (US$)" hint="ZiG price is shown to customers automatically">
            <Input required inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="5.50" />
          </Field>
          <Field label="Section">
            <Select value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
              <option value="">Unsectioned</option>
              {sections.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <ImageUpload
          label="Photo"
          kind="product"
          value={imageUrl}
          onChange={(url, thumb) => {
            setImageUrl(url);
            setThumbUrl(thumb);
          }}
        />
        <div className="flex flex-wrap items-center gap-6">
          <Toggle checked={isAvailable} onChange={setIsAvailable} label="Available" />
          <Toggle checked={trackStock} onChange={setTrackStock} label="Track stock" />
        </div>
        {trackStock ? (
          <Field label="Quantity in stock" hint="Sold-out items are hidden from ordering automatically">
            <Input type="number" min={0} value={stockQty} onChange={(e) => setStockQty(e.target.value)} />
          </Field>
        ) : null}
        <InlineError message={error} />
        <div className="flex justify-end gap-2 border-t border-line pt-4">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={pending}>
            Save product
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function SectionModal({ section, onClose, onSaved }: { section: MenuSection | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [name, setName] = useState(section?.name ?? '');
  const [sortOrder, setSortOrder] = useState(String(section?.sortOrder ?? 0));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setPending(true);
    setError(null);
    try {
      const body = { name: name.trim(), sortOrder: Number(sortOrder) || 0 };
      if (section) await api(`/vendor/sections/${section.id}`, { method: 'PATCH', body });
      else await api('/vendor/sections', { body });
      toast('Section saved');
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save');
    } finally {
      setPending(false);
    }
  };

  const remove = async () => {
    if (!section) return;
    setPending(true);
    try {
      await api(`/vendor/sections/${section.id}`, { method: 'DELETE' });
      toast('Section deleted');
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete');
    } finally {
      setPending(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={section ? 'Edit section' : 'New section'}
      size="sm"
      footer={
        <>
          {section ? (
            <Button variant="ghost" className="mr-auto text-alert" onClick={() => void remove()} disabled={pending}>
              Delete
            </Button>
          ) : null}
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void save()} loading={pending} disabled={!name.trim()}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Section name">
          <Input autoFocus maxLength={60} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Sadza plates" />
        </Field>
        <Field label="Display order" hint="Lower numbers appear first">
          <Input type="number" min={0} value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} />
        </Field>
        {section ? <p className="text-xs text-muted">Deleting a section keeps its products (they become unsectioned).</p> : null}
        <InlineError message={error} />
      </div>
    </Modal>
  );
}
