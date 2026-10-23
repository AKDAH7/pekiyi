import { relations } from "drizzle-orm";

import { fabrics, modelPiecePrices, modelPresets, models, pieceTypes } from "./catalog";
import { customerProductCodes, customers } from "./customers";
import { labelTemplates } from "./labels";
import {
  documentIssues,
  orderItemFabrics,
  orderItemPieces,
  orderItems,
  orderReferenceNotes,
  orders,
  payments,
} from "./orders";

export const modelsRelations = relations(models, ({ many }) => ({
  piecePrices: many(modelPiecePrices),
  presets: many(modelPresets),
}));

export const modelPiecePricesRelations = relations(modelPiecePrices, ({ one }) => ({
  model: one(models, { fields: [modelPiecePrices.modelId], references: [models.id] }),
  pieceType: one(pieceTypes, { fields: [modelPiecePrices.pieceTypeId], references: [pieceTypes.id] }),
}));

export const modelPresetsRelations = relations(modelPresets, ({ one }) => ({
  model: one(models, { fields: [modelPresets.modelId], references: [models.id] }),
}));

export const customersRelations = relations(customers, ({ one, many }) => ({
  orders: many(orders),
  productCodes: many(customerProductCodes),
  defaultLabelTemplate: one(labelTemplates, {
    fields: [customers.defaultLabelTemplateId],
    references: [labelTemplates.id],
  }),
}));

export const customerProductCodesRelations = relations(customerProductCodes, ({ one }) => ({
  customer: one(customers, { fields: [customerProductCodes.customerId], references: [customers.id] }),
  model: one(models, { fields: [customerProductCodes.modelId], references: [models.id] }),
  pieceType: one(pieceTypes, {
    fields: [customerProductCodes.pieceTypeId],
    references: [pieceTypes.id],
  }),
  fabric: one(fabrics, { fields: [customerProductCodes.fabricId], references: [fabrics.id] }),
}));

export const ordersRelations = relations(orders, ({ one, many }) => ({
  customer: one(customers, { fields: [orders.customerId], references: [customers.id] }),
  labelTemplate: one(labelTemplates, {
    fields: [orders.labelTemplateId],
    references: [labelTemplates.id],
  }),
  items: many(orderItems),
  referenceNotes: many(orderReferenceNotes),
  payments: many(payments),
  documentIssues: many(documentIssues),
}));

export const orderItemsRelations = relations(orderItems, ({ one, many }) => ({
  order: one(orders, { fields: [orderItems.orderId], references: [orders.id] }),
  model: one(models, { fields: [orderItems.modelId], references: [models.id] }),
  pieces: many(orderItemPieces),
  fabrics: many(orderItemFabrics),
}));

export const orderItemPiecesRelations = relations(orderItemPieces, ({ one }) => ({
  item: one(orderItems, { fields: [orderItemPieces.itemId], references: [orderItems.id] }),
  pieceType: one(pieceTypes, { fields: [orderItemPieces.pieceTypeId], references: [pieceTypes.id] }),
  modelOverride: one(models, {
    fields: [orderItemPieces.modelOverrideId],
    references: [models.id],
  }),
  fabricOverride: one(fabrics, {
    fields: [orderItemPieces.fabricOverrideId],
    references: [fabrics.id],
  }),
}));

export const orderItemFabricsRelations = relations(orderItemFabrics, ({ one }) => ({
  item: one(orderItems, { fields: [orderItemFabrics.itemId], references: [orderItems.id] }),
  fabric: one(fabrics, { fields: [orderItemFabrics.fabricId], references: [fabrics.id] }),
}));

export const orderReferenceNotesRelations = relations(orderReferenceNotes, ({ one }) => ({
  order: one(orders, { fields: [orderReferenceNotes.orderId], references: [orders.id] }),
}));

export const paymentsRelations = relations(payments, ({ one }) => ({
  order: one(orders, { fields: [payments.orderId], references: [orders.id] }),
}));

export const documentIssuesRelations = relations(documentIssues, ({ one }) => ({
  order: one(orders, { fields: [documentIssues.orderId], references: [orders.id] }),
}));
