import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { z } from "zod";

import { Link } from "@/i18n/navigation";
import { can } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/session";
import { catalogForModel, getModel, listPieceTypes } from "@/lib/catalog/queries";
import { pickLocalized } from "@/lib/i18n/localized";
import { getLatestRates } from "@/lib/settings/queries";
import { fileUrl } from "@/lib/storage/urls";
import { DeleteModelButton, ModelForm } from "@/components/catalog/model-form";
import { PiecesForm, type PieceTableRow } from "@/components/catalog/pieces-form";
import { Presets } from "@/components/catalog/presets";
import { MissingRateBanner } from "@/components/missing-rate-banner";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type Props = { params: Promise<{ id: string }> };

export default async function ModelPage({ params }: Props) {
  const { id } = await params;
  const me = await requirePermission("catalog", "read");
  if (!z.uuid().safeParse(id).success) notFound();

  const [detail, pieceTypes, latest, t, common, locale] = await Promise.all([
    getModel(id),
    listPieceTypes(),
    getLatestRates(),
    getTranslations("catalog"),
    getTranslations("common"),
    getLocale(),
  ]);
  if (!detail) notFound();
  const { model } = detail;
  const name = pickLocalized(model.name, locale);

  const canEdit = can(me.role, "catalog", "update");
  const canSeePrices = can(me.role, "prices", "read");
  const canEditPrices = can(me.role, "prices", "update");
  const canDelete = can(me.role, "catalog", "delete");

  const rows: PieceTableRow[] = pieceTypes.map((type) => {
    const saved = detail.pieces.find((piece) => piece.pieceTypeId === type.id);
    return {
      pieceTypeId: type.id,
      pieceTypeName: pickLocalized(type.name, locale) || type.code,
      isAccessory: type.isAccessory,
      saved: saved
        ? {
            id: saved.id,
            version: saved.version,
            // Never ship prices to a client that may not see them.
            basePrice: canSeePrices ? saved.basePrice : null,
            baseCurrency: canSeePrices ? saved.baseCurrency : null,
            unitCbm: saved.unitCbm,
            unitWeightKg: saved.unitWeightKg,
            packageCount: saved.packageCount,
            packageContents: saved.packageContents,
          }
        : null,
    };
  });

  const catalog = catalogForModel(detail, pieceTypes);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/products" className={buttonVariants({ variant: "ghost", size: "sm" })}>
          <ArrowLeft className="rtl:hidden" />
          <ArrowRight className="hidden rtl:block" />
          {t("backToModels")}
        </Link>
      </div>
      <PageHeader
        title={name && name !== model.code ? `${model.code} · ${name}` : model.code}
        description={t("modelDescription")}
        actions={
          <div className="flex items-center gap-2">
            {model.active ? null : <Badge variant="destructive">{common("inactive")}</Badge>}
            {canDelete ? (
              <DeleteModelButton model={{ id: model.id, version: model.version, code: model.code }} />
            ) : null}
          </div>
        }
      />
      <MissingRateBanner role={me.role} latest={latest} />

      <Card>
        <CardHeader>
          <CardTitle>{t("detailsTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <ModelForm
            canEdit={canEdit}
            model={{
              id: model.id,
              version: model.version,
              code: model.code,
              name: model.name,
              description: model.description,
              isSofabed: model.isSofabed,
              active: model.active,
              photoUrl: model.mainPhotoPath ? fileUrl(model.mainPhotoPath, { thumb: true }) : null,
            }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("pieces.title")}</CardTitle>
          <CardDescription>
            {canSeePrices && !canEditPrices ? t("pieces.pricesReadOnly") : t("pieces.description")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PiecesForm
            modelId={model.id}
            rows={rows}
            canEdit={canEdit}
            canEditPrices={canEditPrices}
            canSeePrices={canSeePrices}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("presets.title")}</CardTitle>
          <CardDescription>{t("presets.description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Presets
            modelId={model.id}
            presets={detail.presets.map((preset) => ({
              id: preset.id,
              version: preset.version,
              composition: preset.composition,
              fixedPrice: canSeePrices ? preset.fixedPrice : null,
              currency: canSeePrices ? preset.currency : null,
            }))}
            context={{
              modelCode: model.code,
              catalog: canSeePrices ? catalog : { ...catalog, pieces: [], presets: [] },
              rates: canSeePrices ? latest.rates : {},
              pieceNames: Object.fromEntries(
                pieceTypes.map((type) => [type.code, pickLocalized(type.name, locale) || type.code]),
              ),
            }}
            permissions={{
              canCreate: can(me.role, "catalog", "create"),
              canEdit,
              canEditPrices,
              canDelete,
              canSeePrices,
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
