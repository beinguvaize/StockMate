/**
 * VanSalePage — full-page van sale (POS-style route).
 * Navigated to from Vehicles.jsx with router state:
 *   { route, vehicle, vanItems, clients, vehicleLocId }
 */
import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTenant } from '../context/TenantContext';
import { useOperations } from '../hooks/useOperations';
import VanSaleBuilder from '../components/VanSaleBuilder';
import GlobalLoading from '../components/GlobalLoading';

const VanSalePage = () => {
  const location  = useLocation();
  const navigate  = useNavigate();
  const { currentTenantId } = useTenant();

  const { recordVanSale } = useOperations(currentTenantId);

  const state = location.state;

  // No state = direct URL access, redirect back
  if (!state?.route) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4">
        <p className="text-gray-500 text-sm font-medium">No van sale context. Go back to Vehicles.</p>
        <button
          onClick={() => navigate(-1)}
          className="px-4 py-2 bg-ink-primary text-white rounded-xl text-sm font-bold"
        >
          Back
        </button>
      </div>
    );
  }

  const { route, vehicle, vanItems = [], clients = [], vehicleLocId } = state;

  const handleSubmit = async ({ cart, clientId, clientName, paymentMethod, total }) => {
    const locId = vehicleLocId;
    const { success, error } = await recordVanSale(route.id, locId, {
      clientName,
      items: cart.map(i => ({
        productId:    i.productId,
        productName:  i.name,
        quantity:     i.quantity,
        sellingPrice: i.price,
      })),
      totalAmount: total,
      paymentMethod,
      vehicleId: route.vehicleId || route['vehicleId'],
    });
    return { success, error };
  };

  return (
    <VanSaleBuilder
      vanItems={vanItems}
      route={route}
      vehicle={vehicle}
      clients={clients}
      onSubmit={handleSubmit}
      onClose={() => navigate(-1)}
      pageMode={true}
    />
  );
};

export default VanSalePage;
