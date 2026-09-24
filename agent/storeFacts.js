// Store facts the assistant may quote. Keep in sync with the policy pages in
// pottery-store-frontend (ShippingPolicy, ReturnPolicy, About, Contact) and Checkout.jsx.

const SHIPPING = {
  flatRate: 5.99,
  freeThreshold: 50,
};

function shippingFor(subtotal) {
  return subtotal >= SHIPPING.freeThreshold ? 0 : SHIPPING.flatRate;
}

const STORE_FACTS = `About: Meenakshi Pottery is a small studio in Kharadi, Pune, India. Every piece is wheel-thrown or hand-built, bisque-fired, glazed and fired again, so each one is unique with slight variations.

Shipping (United States only):
- Orders are processed within 1–2 business days of payment.
- Standard delivery: 3–6 weeks. Expedited delivery: 10–20 business days (where available).
- Free standard shipping on orders of $${SHIPPING.freeThreshold} or more; flat $${SHIPPING.flatRate} below that.
- Carriers: DHL and FedEx. Tracking number is emailed once shipped.
- Pieces ship from India, so US import duties and taxes may apply and are the buyer's responsibility; customs delays are outside our control.
- Packaging: bubble wrap, foam padding and a double-walled box.

Returns:
- 30-day return window for a full refund or exchange; items must be unused, undamaged and in original packaging.
- Damaged or defective on arrival: email photos within 7 days of delivery for a free replacement or full refund including shipping.
- Customer pays return shipping except for damaged/defective items.
- Refunds are processed 5–7 business days after the return is received; banks may take another 5–10 business days.
- Exchanges: return the item and place a new order.
- To start a return, email gaurav@meenapottery.com.

Contact: gaurav@meenapottery.com (fastest for US customers), phone +91 8826230460. Replies within 24–48 hours on business days. Hours: Mon–Fri 10:00 AM–6:00 PM IST, Sat 11:00 AM–4:00 PM IST, closed Sunday. Custom orders: ask by email.

Payment: at checkout with Google Pay. Card details are never collected in chat.

Pages: /return-policy, /shipping-policy, /privacy-policy, /terms, /about, /contact, /checkout.`;

module.exports = { SHIPPING, shippingFor, STORE_FACTS };
