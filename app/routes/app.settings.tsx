import { useState, useCallback } from "react";
import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation } from "@remix-run/react";
import {
  Page,
  Card,
  FormLayout,
  TextField,
  Checkbox,
  Button,
  Banner,
  BlockStack,
  Text,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { getConfig, saveConfig, applyEligibleTag } from "../lib/discount-config.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const { admin } = await authenticate.admin(request);
  const config = await getConfig(admin);
  return json({ config });
}

export async function action({ request }: ActionFunctionArgs) {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();

  const secondPct = Number(formData.get("secondPct"));
  const thirdPct = Number(formData.get("thirdPct"));
  const maxDiscountedTier = Number(formData.get("maxDiscountedTier"));
  const requireEligibleTag = formData.get("requireEligibleTag") === "true";
  const collectionIds = JSON.parse(String(formData.get("collectionIds") || "[]"));

  await saveConfig(admin, { secondPct, thirdPct, maxDiscountedTier, requireEligibleTag });

  if (requireEligibleTag) {
    await applyEligibleTag(admin, collectionIds);
  }

  return json({ ok: true });
}

export default function SettingsPage() {
  const { config } = useLoaderData<typeof loader>();
  const submit = useSubmit();
  const navigation = useNavigation();
  const isSaving = navigation.state === "submitting";

  const [secondPct, setSecondPct] = useState(String(config.secondPct));
  const [thirdPct, setThirdPct] = useState(String(config.thirdPct));
  const [maxDiscountedTier, setMaxDiscountedTier] = useState(String(config.maxDiscountedTier));
  const [requireEligibleTag, setRequireEligibleTag] = useState(config.requireEligibleTag);
  const [collectionIdsText, setCollectionIdsText] = useState(
    (config.collections ?? []).map((c: any) => c.id).join(", ")
  );
  const [saved, setSaved] = useState(false);

  const handleSave = useCallback(() => {
    const collectionIds = collectionIdsText.split(",").map((s) => s.trim()).filter(Boolean);
    const formData = new FormData();
    formData.append("secondPct", secondPct);
    formData.append("thirdPct", thirdPct);
    formData.append("maxDiscountedTier", maxDiscountedTier);
    formData.append("requireEligibleTag", String(requireEligibleTag));
    formData.append("collectionIds", JSON.stringify(collectionIds));
    submit(formData, { method: "post" });
    setSaved(true);
  }, [secondPct, thirdPct, maxDiscountedTier, requireEligibleTag, collectionIdsText, submit]);

  return (
    <Page
      title="Second / Third Pair Discount Settings"
      primaryAction={{ content: "Save", onAction: handleSave, loading: isSaving }}
    >
      <BlockStack gap="400">
        {saved && !isSaving && (
          <Banner tone="success" onDismiss={() => setSaved(false)}>
            Settings saved. Changes apply immediately — no redeploy needed.
          </Banner>
        )}
        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">Discount tiers</Text>
            <FormLayout>
              <FormLayout.Group>
                <TextField label="2nd pair discount (%)" type="number" value={secondPct} onChange={setSecondPct} autoComplete="off" />
                <TextField label="3rd pair discount (%)" type="number" value={thirdPct} onChange={setThirdPct} autoComplete="off" />
              </FormLayout.Group>
              <TextField
                label="Number of pairs the discount applies to"
                helpText="Pairs beyond this number stay at full price. Default 3."
                type="number"
                value={maxDiscountedTier}
                onChange={setMaxDiscountedTier}
                autoComplete="off"
              />
            </FormLayout>
          </BlockStack>
        </Card>
        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">Eligible products</Text>
            <Checkbox
              label="Only apply this discount to specific collections"
              helpText="If unchecked, the discount applies storefront-wide."
              checked={requireEligibleTag}
              onChange={setRequireEligibleTag}
            />
            {requireEligibleTag && (
              <TextField
                label="Collection IDs (comma separated)"
                helpText="e.g. gid://shopify/Collection/111, gid://shopify/Collection/222"
                value={collectionIdsText}
                onChange={setCollectionIdsText}
                autoComplete="off"
                multiline={2}
              />
            )}
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}
