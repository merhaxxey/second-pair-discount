import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { Page, Card, Button, BlockStack, Text, Banner } from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { getOrCreateDiscount } from "../lib/discount-config.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const { admin } = await authenticate.admin(request);
  let discountId: string | null = null;
  let error: string | null = null;
  try {
    discountId = await getOrCreateDiscount(admin);
  } catch (e: any) {
    error = e.message;
  }
  return json({ discountId, error });
}

export default function Index() {
  const { discountId, error } = useLoaderData<typeof loader>();

  return (
    <Page title="Second / Third Pair Discount">
      <BlockStack gap="400">
        {error && <Banner tone="critical">{error}</Banner>}
        {discountId && (
          <Banner tone="success">Discount is active (id: {discountId}).</Banner>
        )}
        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">
              Configure your discount
            </Text>
            <Text as="p">
              Set your 2nd/3rd pair percentages and eligible collections.
            </Text>
            <Button url="/app/settings">Go to Settings</Button>
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}
