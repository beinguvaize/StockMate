/**
 * The process_sale arguments for a web van sale.
 *
 * Mirrors the phone's placeVanSale (driver_provider.dart): the chosen client
 * goes in p_shop_id, and a CREDIT sale is sent as PENDING with no paid amount
 * (process_sale then records 0 paid), so the bill reaches the client's account
 * as money owed. Cash / UPI / card stay PAID, exactly as before.
 *
 * The web used to send p_shop_id: null and PAID for every sale, so a credit
 * van sale was booked as paid by nobody.
 *
 * Returns { error } when the sale must not be saved: a credit sale with no
 * client has nobody to owe it.
 */
export const CREDIT_NEEDS_CLIENT = 'Choose a client for a credit sale. A credit sale needs someone to owe it.';

export const vanSaleParams = ({
  saleId, clientId, items, totalAmount, paymentMethod, date, userId, tenantId, vehicleLocId, routeId,
}) => {
  const method = String(paymentMethod || 'CASH').toUpperCase();
  const client = clientId && clientId !== 'WALKIN' ? clientId : null;
  const credit = method === 'CREDIT';
  if (credit && !client) return { error: new Error(CREDIT_NEEDS_CLIENT) };

  return {
    params: {
      p_id: saleId,
      p_shop_id: client,
      // `id` is the key every server-side reader uses. `rate` matches the POS
      // so reports aggregate the two kinds of sale together.
      p_items: (items || []).map((i) => ({
        id: i.productId,
        name: i.productName,
        quantity: i.quantity,
        rate: i.sellingPrice,
      })),
      p_total_amount: totalAmount,
      p_payment_method: method,
      p_payment_status: credit ? 'PENDING' : 'PAID',
      p_date: date,
      p_user_id: userId,
      p_tenant_id: tenantId || null,
      p_location_id: vehicleLocId || null,
      p_route_id: routeId || null,
      p_source_app: 'WEB',
    },
  };
};
