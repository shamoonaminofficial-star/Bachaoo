'use client';
import React, { useCallback, useEffect, useState } from 'react';
import { Card, Button, Badge, Input, Modal, ConfirmModal, useToast, Skeleton, EmptyState, ErrorState } from '@bachatly/ui';
import { ApiError } from '@/lib/api';
import {
  adminLocationTree, adminCreateCity, adminUpdateCity, adminCreateArea, adminDeleteArea,
  type LocationTree, type ApiArea,
} from '@/lib/catalog';

export default function AdminLocationsPage() {
  const { toast } = useToast();
  const [tree, setTree] = useState<LocationTree | null>(null);
  const [error, setError] = useState(false);
  const [cityModal, setCityModal] = useState<{ provinceId: string; provinceName: string } | null>(null);
  const [cityName, setCityName] = useState('');
  const [cityDefault, setCityDefault] = useState(false);
  const [areaFor, setAreaFor] = useState<{ cityId: string; cityName: string } | null>(null);
  const [areaName, setAreaName] = useState('');
  const [delArea, setDelArea] = useState<ApiArea | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try { setTree(await adminLocationTree()); }
    catch { setTree(null); setError(true); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const createCity = async () => {
    if (!cityModal || !cityName.trim()) { toast('City name is required.', 'error'); return; }
    setSaving(true);
    try {
      await adminCreateCity({ name: cityName.trim(), provinceId: cityModal.provinceId, isDefault: cityDefault });
      toast('City added.'); setCityModal(null); setCityName(''); setCityDefault(false); await load();
    } catch (e) { toast(e instanceof ApiError ? e.message : 'Could not add city.', 'error'); }
    finally { setSaving(false); }
  };

  const toggleDefault = async (id: string, name: string, current: boolean) => {
    try { await adminUpdateCity(id, { isDefault: !current }); toast(current ? `${name} is no longer the default city.` : `${name} set as default city.`); await load(); }
    catch (e) { toast(e instanceof ApiError ? e.message : 'Update failed.', 'error'); }
  };

  const createArea = async () => {
    if (!areaFor || !areaName.trim()) { toast('Area name is required.', 'error'); return; }
    setSaving(true);
    try {
      await adminCreateArea({ name: areaName.trim(), cityId: areaFor.cityId });
      toast('Area added.'); setAreaFor(null); setAreaName(''); await load();
    } catch (e) { toast(e instanceof ApiError ? e.message : 'Could not add area.', 'error'); }
    finally { setSaving(false); }
  };

  const doDeleteArea = async () => {
    if (!delArea) return;
    try { await adminDeleteArea(delArea.id); toast('Area removed.'); setDelArea(null); await load(); }
    catch (e) { toast(e instanceof ApiError ? e.message : 'Could not remove area.', 'error'); }
  };

  return (
    <div className="space-y-4">
      <div><h1 className="text-2xl font-extrabold text-ink">Locations</h1>
      <p className="text-sm text-slate-500">Manage the country → province → city → area hierarchy. Customers pick their city at registration.</p></div>

      {!tree && !error && <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>}
      {error && <ErrorState title="Could not load locations" onRetry={load} />}
      {tree && tree.countries.length === 0 && <EmptyState icon="📍" title="No locations configured" />}
      {tree && tree.countries.map((country) => (
        <Card key={country.id} className="p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-ink">🇵🇰 {country.name} <span className="text-xs font-medium text-slate-400">({country.code})</span></h2>
          </div>
          <div className="mt-3 space-y-3">
            {country.provinces.map((prov) => (
              <div key={prov.id} className="rounded-2xl border border-slate-100 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-semibold text-ink">{prov.name} <span className="text-xs font-normal text-slate-400">· {prov.cities.length} cities</span></h3>
                  <Button size="sm" variant="outline" onClick={() => setCityModal({ provinceId: prov.id, provinceName: prov.name })}>+ Add City</Button>
                </div>
                {prov.cities.length === 0 ? (
                  <p className="mt-2 text-sm text-slate-400">No cities yet.</p>
                ) : (
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    {prov.cities.map((city) => (
                      <div key={city.id} className="rounded-xl bg-slate-50 p-3">
                        <div className="flex items-center justify-between">
                          <p className="font-semibold text-ink">{city.name}{city.isDefault && <> <Badge tone="brand">DEFAULT</Badge></>}
                          </p>
                          <div className="flex gap-1">
                            <Button size="sm" variant="ghost" onClick={() => toggleDefault(city.id, city.name, city.isDefault)}>
                              {city.isDefault ? 'Unset default' : 'Set default'}
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => setAreaFor({ cityId: city.id, cityName: city.name })}>+ Area</Button>
                          </div>
                        </div>
                        {city.areas.length === 0 ? (
                          <p className="mt-1 text-xs text-slate-400">No areas yet.</p>
                        ) : (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {city.areas.map((a) => (
                              <span key={a.id} className="group inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-xs font-medium text-slate-600 shadow-sm">
                                {a.name}
                                <button onClick={() => setDelArea(a)} aria-label={`Remove ${a.name}`}
                                  className="text-slate-300 hover:text-error">✕</button>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </Card>
      ))}

      <Modal open={!!cityModal} onClose={() => setCityModal(null)} title={`Add city — ${cityModal?.provinceName}`}
        footer={<><Button variant="ghost" onClick={() => setCityModal(null)}>Cancel</Button><Button onClick={createCity} loading={saving}>Add City</Button></>}>
        <div className="space-y-3">
          <Input label="City name *" value={cityName} onChange={(e) => setCityName(e.target.value)} placeholder="e.g. Multan" />
          <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <input type="checkbox" checked={cityDefault} onChange={(e) => setCityDefault(e.target.checked)} className="h-4 w-4 accent-[#0B6B4F]" />
            Set as default city (pre-selected at registration)
          </label>
        </div>
      </Modal>

      <Modal open={!!areaFor} onClose={() => setAreaFor(null)} title={`Add area — ${areaFor?.cityName}`}
        footer={<><Button variant="ghost" onClick={() => setAreaFor(null)}>Cancel</Button><Button onClick={createArea} loading={saving}>Add Area</Button></>}>
        <Input label="Area name *" value={areaName} onChange={(e) => setAreaName(e.target.value)} placeholder="e.g. Gulberg" />
      </Modal>

      <ConfirmModal open={!!delArea} onClose={() => setDelArea(null)} danger confirmLabel="Remove area"
        onConfirm={doDeleteArea} title="Remove area" action="Remove area" affected={delArea ? `${delArea.name} (${delArea.cityName || ''})` : ''} />
    </div>
  );
}
