/**
 * VanSalePage — full-page van sale (POS-style route).
 * Navigated to from Vehicles.jsx with router state:
 *   { route, vehicle, vanItems, clients, vehicleLocId, driverName }
 */
import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTenant } from '../context/TenantContext';
import { useOperations } from '../hooks/useOperations';
import VanSaleBuilder from '../components/VanSaleBuilder';
import { Truck } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Empty } from '../components/vehicles/parts';

const VanSalePage = () => {
  const location  = useLocation();
  const navigate  = useNavigate();
  const { currentTenantId } = useTenant();

  const { recordVanSale } = useOperations(currentTenantId);

  const state = location.state;

  // No state = opened without a trip (direct URL, reload): send back to Vehicles.
  if (!state?.route) {
    return (
      <div className="m-rise mx-auto mt-6 max-w-[520px]">
        <Empty icon={Truck} title="Start a van sale from a trip"
          action={<Button onClick={() => navigate('/vehicles')}>Back to Vehicles</Button>}>
          Open Vehicles, then Van sale on a trip that is on the road.
        </Empty>
      </div>
    );
  }

  const { route, vehicle, vanItems = [], clients = [], vehicleLocId, driverName } = state;

  const handleSubmit = async ({ cart, clientId, clientName, paymentMethod, total }) => {
    const locId = vehicleLocId;
    // The client's id, not only its name: process_sale books a credit sale
    // against p_shop_id, and the web used to send null here.
    const { success, error } = await recordVanSale(route.id, locId, {
      clientId,
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
      driverName={driverName}
      clients={clients}
      onSubmit={handleSubmit}
      onClose={() => navigate(-1)}
      pageMode={true}
    />
  );
};

export default VanSalePage;
