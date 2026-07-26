# Second / Third Pair Discount — Shopify Function (no hosting required)

An escalating multi-pair discount ("2nd pair 20% off, 3rd pair 30% off") built
as a Shopify Function. **Nothing in this project requires external hosting.**
The Function itself runs entirely on Shopify's infrastructure once deployed.

Settings (percentages, tier count, etc.) are configured directly through
Shopify Admin's built-in metafield editor — no custom admin app, no server,
no Render/Fly/Heroku account needed.

**Requires Shopify Plus** — custom Shopify Functions (private, non-App-Store
apps) are only available to Plus merchants. Confirm your plan before deploying.

## What this handles

- Two different add-to-cart paths on your storefront:
  - Normal products -> one line item, standard Shopify form.
  - Lens products -> two linked line items (frame + a "Lens Add-on" line),
    added via your custom modal, linked by `_frame_token` / `_frame_ref`
    cart line attributes.
- Groups each into one logical "pair," ranks pairs cheapest-first (so your
  priciest item is never the one discounted), and applies the tiered %
  to the 2nd and 3rd pair -- to *both* the frame line and its linked lens
  add-on line, so the discount reflects the pair's full price.
- 4th pair and beyond stay full price automatically.
- Percentages, tier count, and eligibility are configurable via a metafield
  you edit directly in Shopify Admin -- see step 6 below.

## Project structure

```
second-pair-discount/
|-- shopify.app.toml                     # app-level config
|-- extensions/second-pair-discount/
    |-- shopify.extension.toml           # function config + metafield declaration
    |-- package.json
    |-- src/
        |-- run.graphql                  # function input query
        |-- run.ts                       # the actual discount logic
```

## Setup -- every step happens on your machine + Shopify Admin, nothing external

1. **Install the CLI and log in**
   ```bash
   npm install -g @shopify/cli@latest
   cd second-pair-discount
   shopify auth login
   ```

2. **Install the Function's own dependencies**
   ```bash
   cd extensions/second-pair-discount
   npm install
   cd ../..
   ```

3. **First run -- creates the app registration for you**
   ```bash
   shopify app dev --reset
   ```
   Follow the prompts: select your Partner organization, create a new app,
   pick a development store to test against. This fills in `client_id` in
   `shopify.app.toml` automatically.

4. **Deploy for real**
   ```bash
   shopify app deploy
   ```
   This uploads the Function to Shopify. It now lives entirely on Shopify's
   servers -- nothing to host, nothing to keep running on your end.

5. **Install the app on your actual store**
   The CLI will give you an install link after deploy, or you can install it
   from your Partner Dashboard -> your app -> "Test on development store" /
   "Select store" if deploying straight to your live Plus store.

6. **Create the discount + set your percentages (no code, no UI to build)**
   - Go to **Shopify Admin -> Discounts -> Create discount -> App discount** ->
     select "Second/Third Pair Discount".
   - Save it -- this creates the Automatic Discount tied to your Function.
   - Go to **Shopify Admin -> Settings -> Custom data -> Discounts** (or open
     the discount you just created and look for its metafields section,
     depending on your Shopify Admin version).
   - Add/edit the metafield with:
     - Namespace: `$app:second-pair-discount`
     - Key: `config`
     - Type: `JSON`
     - Value:
       ```json
       {
         "secondPct": 20,
         "thirdPct": 30,
         "maxDiscountedTier": 3,
         "requireEligibleTag": false,
         "discountAddonLine": true
       }
       ```
   - Save. The Function picks this up on the very next cart evaluation -- no
     redeploy needed.

   **Note:** `requireEligibleTag: false` means the discount applies
   storefront-wide. If you want it limited to specific collections, set this
   to `true` and manually add the tag `pair-discount-eligible` to eligible
   products (Admin -> Products -> bulk edit -> Tags) -- this replaces the
   auto-tagging a custom admin UI would otherwise do for you.

## Known limitations / things to test before launch

- **Same-variant stacked quantity**: if a customer adds quantity 3 of the
  *same* variant in one line (rather than 3 separate add-to-cart actions),
  Shopify Function discount targeting is line-level, not per-unit -- you
  can't apply 3 different percentages within one line without a Cart
  Transform Function splitting quantities into separate lines first. Lens
  products don't hit this since the modal always creates a distinct line +
  token per completed flow.
- **Ranking re-evaluates on every cart change**: the "2nd pair" and "3rd
  pair" discount tiers stay active, but which *physical* pair currently
  occupies that rank can shift as pairs are added/removed (cheapest-first
  ranking). This is standard behavior for this discount type.
- **Malformed/missing config**: `run.ts` falls back to sane defaults
  (20% / 30% / 3 tiers) if the metafield is missing or malformed, so a
  typo in the JSON never breaks checkout -- but worth testing deliberately.
- **Manual tagging**: without a custom admin UI, adding/removing products
  from eligibility means manually tagging them `pair-discount-eligible` in
  Admin -- fine for a manageable catalog, more tedious at scale.
