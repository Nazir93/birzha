# Каталог таблиц и ключевых полей

## Назначение

Этот каталог переводит концептуальную ER-модель в практический список таблиц, полей, ограничений и индексов.

## Справочники

### `users`
| Поле | Тип | Назначение |
| --- | --- | --- |
| `id` | uuid | PK |
| `login` | varchar | уникальный логин |
| `passwordHash` | varchar | хэш пароля |
| `isActive` | boolean | активность учетной записи |
| `lastLoginAt` | timestamptz | последнее посещение |

Индексы:
- unique(`login`)

### `roles`
| Поле | Тип | Назначение |
| --- | --- | --- |
| `id` | uuid | PK |
| `code` | varchar | уникальный код роли |
| `name` | varchar | название роли |

### `userRoles`
| Поле | Тип | Назначение |
| --- | --- | --- |
| `userId` | uuid | FK -> users |
| `roleId` | uuid | FK -> roles |
| `scopeType` | varchar | global, warehouse, market |
| `scopeId` | uuid nullable | идентификатор области |

### `employees`
| Поле | Тип | Назначение |
| --- | --- | --- |
| `id` | uuid | PK |
| `userId` | uuid nullable | связь с учетной записью |
| `fullName` | varchar | ФИО |
| `phone` | varchar | телефон |
| `employeeType` | varchar | purchaser, keeper, seller, accountant |
| `defaultWarehouseId` | uuid nullable | основной склад |
| `defaultMarketId` | uuid nullable | основная торговая точка |

### `suppliers`
Основной контрагент закупки.

Поля:
- `id`
- `name`
- `phone`
- `regionId`
- `isActive`

### `customers`
Поля:
- `id`
- `name`
- `phone`
- `customerType`
- `marketId`
- `creditLimit`
- `isActive`

Индексы:
- index(`phone`)
- index(`customerType`, `marketId`)

### `warehouses`
Поля:
- `id`
- `code`
- `name`
- `regionId`
- `address`
- `isActive`

### `markets`
Поля:
- `id`
- `name`
- `regionId`
- `address`

### `products`
Поля:
- `id`
- `code`
- `name`
- `categoryId`
- `isActive`

### `grades`
Поля:
- `id`
- `code`
- `name`
- `sortOrder`

### `qualityClasses`
Поля:
- `id`
- `code`
- `name`
- `isSellable`

### `destinationChannels`
Поля:
- `id`
- `code`
- `name`

### `packagingTypes`
Поля:
- `id`
- `code`
- `name`
- `defaultNetWeightKg`

### `productVariants`
Коммерческий вариант товара.

Поля:
- `id`
- `productId`
- `gradeId`
- `commercialLabel`
- `qualityClassId`
- `packagingTypeId`
- `isActive`

Индексы:
- unique(`productId`, `gradeId`, `commercialLabel`, `qualityClassId`, `packagingTypeId`)

## Закупка и партии

### `purchaseDocuments`
Поля:
- `id`
- `documentNumber`
- `documentDate`
- `supplierId`
- `purchaserEmployeeId`
- `warehouseId`
- `currency`
- `additionalExpensesAmount`
- `totalAmount`
- `status`
- `sourcePhotoAttachmentId`
- `createdAt`
- `confirmedAt`
- `postedAt`

Индексы:
- unique(`documentNumber`, `supplierId`)
- index(`documentDate`)
- index(`warehouseId`, `status`)

### `purchaseItems`
Поля:
- `id`
- `purchaseDocumentId`
- `lineNo`
- `productVariantId`
- `qualityClassId`
- `qtyKg`
- `qtyBoxes`
- `purchasePrice`
- `lineAmount`
- `comment`

Индексы:
- index(`purchaseDocumentId`)
- index(`productVariantId`)

### `warehouseReceipts`
Поля:
- `id`
- `receiptNumber`
- `receiptDate`
- `warehouseId`
- `purchaseDocumentId`
- `receivedByEmployeeId`
- `status`

### `warehouseReceiptItems`
Поля:
- `id`
- `warehouseReceiptId`
- `purchaseItemId`
- `acceptedQtyKg`
- `acceptedQtyBoxes`
- `acceptedQualityClassId`
- `createdBatchId`

### `batches`
Поля:
- `id`
- `parentBatchId`
- `sourcePurchaseItemId`
- `originWarehouseId`
- `productVariantId`
- `qualityClassId`
- `destinationChannelId`
- `initialQtyKg`
- `initialQtyBoxes`
- `costAmount`
- `status`
- `createdAt`

Индексы:
- index(`parentBatchId`)
- index(`productVariantId`, `qualityClassId`)
- index(`originWarehouseId`)

## Склад и движения

### `allocations`
Поля:
- `id`
- `allocationNumber`
- `allocationDate`
- `allocationType`
- `warehouseId`
- `performedByEmployeeId`
- `status`

### `allocationItems`
Поля:
- `id`
- `allocationId`
- `sourceBatchId`
- `targetBatchId`
- `sourceQualityClassId`
- `targetQualityClassId`
- `sourceDestinationChannelId`
- `targetDestinationChannelId`
- `qtyKg`
- `qtyBoxes`
- `reasonCode`

### `stockMovements`
Главная таблица учета.

Поля:
- `id`
- `movementDate`
- `documentType`
- `documentId`
- `documentLineId`
- `batchId`
- `movementType`
- `storageContextType`
- `storageContextId`
- `qtyKgDelta`
- `qtyBoxesDelta`
- `costDelta`
- `qualityClassId`
- `destinationChannelId`
- `tripId`
- `sellerEmployeeId`
- `warehouseId`
- `createdAt`

Индексы:
- index(`batchId`, `movementDate`)
- index(`storageContextType`, `storageContextId`)
- index(`tripId`)
- index(`sellerEmployeeId`)
- index(`warehouseId`)
- unique(`documentType`, `documentId`, `documentLineId`, `movementType`, `storageContextType`, `storageContextId`)

### `stockBalanceSnapshots`
Поля:
- `id`
- `snapshotDate`
- `storageContextType`
- `storageContextId`
- `batchId`
- `qtyKg`
- `qtyBoxes`
- `costAmount`

## Логистика и рейсы

### `vehicles`
Поля:
- `id`
- `plateNumber`
- `vehicleType`
- `capacityBoxes`
- `isActive`

### `routes`
Поля:
- `id`
- `code`
- `fromRegionId`
- `toRegionId`
- `name`

### `trips`
Поля:
- `id`
- `tripNumber`
- `routeId`
- `vehicleId`
- `driverName`
- `driverPhone`
- `departureWarehouseId`
- `plannedDepartureAt`
- `actualDepartureAt`
- `actualArrivalAt`
- `status`

Индексы:
- unique(`tripNumber`)
- index(`status`, `plannedDepartureAt`)

### `tripShipments`
Поля:
- `id`
- `shipmentNumber`
- `shipmentDate`
- `tripId`
- `warehouseId`
- `loadedByEmployeeId`
- `status`

### `tripShipmentItems`
Поля:
- `id`
- `tripShipmentId`
- `batchId`
- `destinationChannelId`
- `qtyKg`
- `qtyBoxes`
- `costAmount`

### `tripAcceptances`
Поля:
- `id`
- `acceptanceNumber`
- `acceptanceDate`
- `tripId`
- `sellerEmployeeId`
- `marketId`
- `acceptedByEmployeeId`
- `status`

### `tripAcceptanceItems`
Поля:
- `id`
- `tripAcceptanceId`
- `tripShipmentItemId`
- `batchId`
- `acceptedQtyKg`
- `acceptedQtyBoxes`
- `shortageQtyKg`
- `shortageQtyBoxes`
- `excessQtyKg`
- `excessQtyBoxes`
- `acceptedQualityClassId`
- `discrepancyReasonCode`

### `sellerTransfers`
Поля:
- `id`
- `transferDate`
- `tripId`
- `fromSellerEmployeeId`
- `toSellerEmployeeId`
- `approvedByEmployeeId`
- `status`

### `sellerTransferItems`
Поля:
- `id`
- `sellerTransferId`
- `batchId`
- `qtyKg`
- `qtyBoxes`

## Продажи и долги

### `sales`
Поля:
- `id`
- `saleNumber`
- `saleDateTime`
- `tripId`
- `sellerEmployeeId`
- `marketId`
- `customerId`
- `saleType`
- `paymentType`
- `totalAmount`
- `paidAmount`
- `debtAmount`
- `status`

Индексы:
- unique(`saleNumber`)
- index(`sellerEmployeeId`, `saleDateTime`)
- index(`tripId`)
- index(`customerId`)

### `saleItems`
Поля:
- `id`
- `saleId`
- `batchId`
- `productVariantId`
- `qtyKg`
- `qtyBoxes`
- `salePrice`
- `lineAmount`

### `receivables`
Поля:
- `id`
- `saleId`
- `customerId`
- `originalAmount`
- `paidAmount`
- `remainingAmount`
- `dueDate`
- `status`
- `createdAt`
- `closedAt`

Индексы:
- index(`customerId`, `status`)
- index(`dueDate`)

### `receivablePayments`
Поля:
- `id`
- `receivableId`
- `paymentDate`
- `paymentMethod`
- `paymentAmount`
- `receivedByEmployeeId`
- `comment`

## Списания, возвраты, инвентаризация

### `writeOffs`
Поля:
- `id`
- `writeOffDate`
- `storageContextType`
- `storageContextId`
- `responsibleEmployeeId`
- `reasonCode`
- `status`

### `writeOffItems`
Поля:
- `id`
- `writeOffId`
- `batchId`
- `qtyKg`
- `qtyBoxes`
- `estimatedLossAmount`

### `returns`
Поля:
- `id`
- `returnDate`
- `saleId`
- `customerId`
- `acceptedByEmployeeId`
- `reasonCode`
- `status`

### `returnItems`
Поля:
- `id`
- `returnId`
- `batchId`
- `qtyKg`
- `qtyBoxes`
- `returnAmount`
- `returnDisposition`

### `inventoryChecks`
Поля:
- `id`
- `inventoryDate`
- `contextType`
- `contextId`
- `performedByEmployeeId`
- `status`

### `inventoryCheckItems`
Поля:
- `id`
- `inventoryCheckId`
- `batchId`
- `bookQtyKg`
- `bookQtyBoxes`
- `factQtyKg`
- `factQtyBoxes`
- `differenceReasonCode`

## Деньги, вложения, аудит, синк

### `moneyMovements`
Поля:
- `id`
- `movementDate`
- `documentType`
- `documentId`
- `direction`
- `amount`
- `paymentMethod`
- `customerId`
- `tripId`
- `comment`

### `expenses`
Поля:
- `id`
- `expenseDate`
- `expenseScopeType`
- `expenseScopeId`
- `expenseTypeId`
- `amount`
- `currency`
- `responsibleEmployeeId`
- `comment`

### `attachments`
Поля:
- `id`
- `fileName`
- `storageKey`
- `mimeType`
- `sizeBytes`
- `uploadedByUserId`
- `linkedEntityType`
- `linkedEntityId`
- `createdAt`

### `auditLog`
Поля:
- `id`
- `entityType`
- `entityId`
- `actionType`
- `changedByUserId`
- `deviceId`
- `payloadJson`
- `createdAt`

### `documentStatusHistory`
Поля:
- `id`
- `documentType`
- `documentId`
- `oldStatus`
- `newStatus`
- `changedByUserId`
- `changedAt`

### `syncQueue`
Поля:
- `id`
- `deviceId`
- `entityType`
- `entityId`
- `operationType`
- `payloadJson`
- `syncStatus`
- `attemptCount`
- `lastAttemptAt`
- `createdAt`

### `syncConflicts`
Поля:
- `id`
- `deviceId`
- `entityType`
- `entityId`
- `serverVersion`
- `clientVersion`
- `conflictType`
- `resolutionStatus`
- `resolvedByUserId`
- `resolvedAt`

## Рекомендуемые ограничения уровня БД

- `qtyKg >= 0`
- `qtyBoxes >= 0`
- `amount >= 0`
- `remainingAmount >= 0`
- `status` только из допустимого enum
- запрет удаления строк из `stockMovements`, `moneyMovements`, `auditLog`

## Рекомендуемые индексы для отчетов

- `stockMovements(movementDate, warehouseId)`
- `stockMovements(movementDate, tripId)`
- `sales(saleDateTime, sellerEmployeeId)`
- `sales(saleDateTime, tripId)`
- `receivables(status, dueDate)`
- `expenses(expenseScopeType, expenseScopeId)`

## Что обязательно материализовать

Если объем данных вырастет, материализовать:
- остатки по складам
- остатки по продавцам
- остатки по рейсам
- открытые долги
- прибыль по рейсам
