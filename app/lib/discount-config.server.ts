const NAMESPACE = "$app:cus-discounts";
const KEY = "config";

export type DiscountConfig = {
  secondPct: number;
  thirdPct: number;
  maxDiscountedTier: number;
  requireEligibleTag: boolean;
  collections?: { id: string; title: string; image?: string }[];
};

const DEFAULTS: DiscountConfig = {
  secondPct: 20,
  thirdPct: 30,
  maxDiscountedTier: 3,
  requireEligibleTag: false,
  collections: [],
};

export async function getOrCreateDiscount(admin: any): Promise<string> {
  const existing = await admin.graphql(
    `#graphql
    query FindAppDiscount {
      discountNodes(first: 5, query: "app_discount_type:automatic") {
        nodes {
          id
          discount {
            ... on DiscountAutomaticApp {
              title
            }
          }
        }
      }
    }`
  );
  const existingData = await existing.json();
  const found = (existingData?.data?.discountNodes?.nodes ?? []).find(
    (n: any) => n.discount?.title === "Second/Third Pair Discount"
  );
  if (found) return found.id;

  const fnRes = await admin.graphql(
    `#graphql
    query GetFunctions {
      shopifyFunctions(first: 25) { nodes { id title } }
    }`
  );
  const fnData = await fnRes.json();
  const fn = (fnData?.data?.shopifyFunctions?.nodes ?? []).find((f: any) =>
    f.title?.toLowerCase().includes("discount")
  );
  if (!fn) throw new Error("Function not found — deploy the extension first.");

  const created = await admin.graphql(
    `#graphql
    mutation CreateDiscount($functionId: String!) {
      discountAutomaticAppCreate(automaticAppDiscount: {
        title: "Second/Third Pair Discount",
        functionId: $functionId,
        startsAt: "${new Date().toISOString()}",
        discountClasses: [PRODUCT]
      }) {
        automaticAppDiscount { discountId }
        userErrors { field message }
      }
    }`,
    { variables: { functionId: fn.id } }
  );
  const createdData = await created.json();
  const errors = createdData?.data?.discountAutomaticAppCreate?.userErrors;
  if (errors?.length) throw new Error(errors.map((e: any) => e.message).join(", "));

  return createdData.data.discountAutomaticAppCreate.automaticAppDiscount.discountId;
}

export async function getConfig(admin: any): Promise<DiscountConfig> {
  const discountId = await getOrCreateDiscount(admin);

  const response = await admin.graphql(
    `#graphql
    query GetDiscountConfig($id: ID!) {
      discountNode(id: $id) {
        metafield(namespace: "${NAMESPACE}", key: "${KEY}") {
          value
        }
      }
    }`,
    { variables: { id: discountId } }
  );

  const data = await response.json();
  const raw = data?.data?.discountNode?.metafield?.value;
  if (!raw) return DEFAULTS;

  try {
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return DEFAULTS;
  }
}

export async function saveConfig(
  admin: any,
  config: Omit<DiscountConfig, "collections">
): Promise<void> {
  const discountId = await getOrCreateDiscount(admin);

  await admin.graphql(
    `#graphql
    mutation SaveDiscountConfig($id: ID!, $value: String!) {
      metafieldsSet(metafields: [{
        ownerId: $id,
        namespace: "${NAMESPACE}",
        key: "${KEY}",
        type: "json",
        value: $value
      }]) {
        userErrors { field message }
      }
    }`,
    {
      variables: {
        id: discountId,
        value: JSON.stringify(config),
      },
    }
  );
}

export async function applyEligibleTag(admin: any, collectionIds: string[]): Promise<void> {
  const TAG = "pair-discount-eligible";

  const currentlyTagged = await admin.graphql(
    `#graphql
    query TaggedProducts {
      products(first: 250, query: "tag:'${TAG}'") {
        nodes { id }
      }
    }`
  );
  const currentData = await currentlyTagged.json();
  const currentIds: string[] = (currentData?.data?.products?.nodes ?? []).map((p: any) => p.id);

  const desiredIds = new Set<string>();
  for (const collectionId of collectionIds) {
    const res = await admin.graphql(
      `#graphql
      query ProductsInCollection($id: ID!) {
        collection(id: $id) {
          products(first: 250) { nodes { id } }
        }
      }`,
      { variables: { id: collectionId } }
    );
    const data = await res.json();
    const products = data?.data?.collection?.products?.nodes ?? [];
    products.forEach((p: any) => desiredIds.add(p.id));
  }

  for (const id of currentIds) {
    if (!desiredIds.has(id)) {
      await admin.graphql(
        `#graphql
        mutation RemoveTag($id: ID!, $tags: [String!]!) {
          tagsRemove(id: $id, tags: $tags) { userErrors { message } }
        }`,
        { variables: { id, tags: [TAG] } }
      );
    }
  }

  for (const id of desiredIds) {
    await admin.graphql(
      `#graphql
      mutation AddTag($id: ID!, $tags: [String!]!) {
        tagsAdd(id: $id, tags: $tags) { userErrors { message } }
      }`,
      { variables: { id, tags: [TAG] } }
    );
  }
}
