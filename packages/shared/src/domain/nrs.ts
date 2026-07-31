/**
 * NRS e-invoice mandatory field reference (Phase 1 target).
 *
 * This file documents the shape the REAL NRS submission must take so the
 * Phase 1 work is pre-scoped. The Nigerian NRS e-invoice standard is based on
 * Peppol BIS 3.0 (which in turn profiles OASIS UBL 2.1), extended with the
 * mandatory fields required by the Federal Inland Revenue Service's (FIRS)
 * e-invoice guideline. The regulated payload has 55 mandatory fields.
 *
 * IMPORTANT: the authoritative field list lives in the NRS MBS onboarding
 * pack issued to accredited Solution Providers. The list below is a faithful
 * reference summary grouped by UBL section. Before Phase 1 implementation,
 * validate it against the copy you receive during accreditation — the field
 * identifiers (XPath), the profile/customisation identifiers, and the
 * signing/hash requirements are the source of truth.
 *
 * REAL INTEGRATION PIPELINE (Phase 1):
 *   apps/whatsapp-worker/src/providers/realNrsProvider.ts
 *     1. Build UBL 2.1 XML from InvoiceDraft using the mapping below.
 *     2. Compute the signing hash (per NRS spec, currently HMAC/SHA-256 of the
 *        XML with the Solution Provider private key material supplied at
 *        accreditation).
 *     3. Authenticate to the NRS MBS (Multi-Business Service) — REST/SOAP
 *        endpoint provided at accreditation; exchange the session/CSID token.
 *     4. Submit; map the response to SubmissionResult (irn / csid / qrCodeUrl).
 *     5. The returned QR code and IRN are stored on the Invoice row so the
 *        merchant's receipt/invoice PDF can embed them.
 *
 * 55 MANDATORY FIELDS (reference summary — grouped by UBL section)
 *
 * --- Document / envelope ---
 *  1  cbc:CustomizationID                ("urn:cen.eu:en16931:2017#compliant#..."
 *                                          per NRS profile)
 *  2  cbc:ProfileID                      (NRS-issued profile identifier)
 *  3  cbc:ID                             (invoice number)
 *  4  cbc:IssueDate
 *  5  cbc:DueDate
 *  6  cbc:InvoiceTypeCode                (e.g. 380 = commercial invoice)
 *  7  cbc:DocumentCurrencyCode           (ISO 4217, "NGN")
 *  8  cbc:Note                           (free text note)
 *  9  cbc:BuyerReference                 (customer reference)
 *
 * --- Seller (AccountingSupplierParty) ---
 * 10  cac:Party/cbc:WebsiteURI
 * 11  cac:Party/cac:PartyName/cbc:Name
 * 12  cac:Party/cac:PostalAddress/cbc:StreetName
 * 13  cac:Party/cac:PostalAddress/cbc:BuildingNumber
 * 14  cac:Party/cac:PostalAddress/cbc:CityName
 * 15  cac:Party/cac:PostalAddress/cbc:PostalZone
 * 16  cac:Party/cac:PostalAddress/cbc:CountrySubentity       (state)
 * 17  cac:Party/cac:PostalAddress/cac:Country/cbc:IdentificationCode  (NG)
 * 18  cac:Party/cac:PartyTaxScheme/cbc:CompanyID             (TIN)
 * 19  cac:Party/cac:PartyTaxScheme/cac:TaxScheme/cbc:ID
 * 20  cac:Party/cac:PartyLegalEntity/cbc:RegistrationName    (registered name)
 * 21  cac:Party/cac:PartyLegalEntity/cbc:CompanyID
 * 22  cac:Party/cac:Contact/cbc:Telephone
 * 23  cac:Party/cac:Contact/cbc:ElectronicMail
 *
 * --- Buyer (AccountingCustomerParty) ---
 * 24  cac:Party/cac:PartyName/cbc:Name
 * 25  cac:Party/cac:PostalAddress/cbc:StreetName
 * 26  cac:Party/cac:PostalAddress/cbc:BuildingNumber
 * 27  cac:Party/cac:PostalAddress/cbc:CityName
 * 28  cac:Party/cac:PostalAddress/cbc:PostalZone
 * 29  cac:Party/cac:PostalAddress/cac:Country/cbc:IdentificationCode
 * 30  cac:Party/cac:PartyTaxScheme/cbc:CompanyID              (buyer TIN, if any)
 * 31  cac:Party/cac:PartyLegalEntity/cbc:RegistrationName
 *
 * --- Tax total ---
 * 32  cac:TaxTotal/cbc:TaxAmount
 * 33  cac:TaxTotal/cac:TaxSubtotal/cbc:TaxableAmount
 * 34  cac:TaxTotal/cac:TaxSubtotal/cbc:TaxAmount
 * 35  cac:TaxTotal/cac:TaxSubtotal/cac:TaxCategory/cbc:ID     (tax type code)
 * 36  cac:TaxTotal/cac:TaxSubtotal/cac:TaxCategory/cbc:Percent
 * 37  cac:TaxTotal/cac:TaxSubtotal/cac:TaxCategory/cac:TaxScheme/cbc:ID
 *
 * --- Totals ---
 * 38  cbc:InvoiceTotalWithoutTaxAmount
 * 39  cbc:InvoiceTotalWithTaxAmount
 * 40  cbc:PayableAmount
 *
 * --- Per invoice line (each cac:InvoiceLine repeats) ---
 * 41  cbc:ID
 * 42  cbc:InvoicedQuantity
 * 43  cbc:LineExtensionAmount
 * 44  cac:Item/cbc:Name
 * 45  cac:Item/cbc:Description
 * 46  cac:Item/cac:SellersItemIdentification/cbc:ID
 * 47  cac:Item/cac:ClassifiedTaxCategory/cbc:ID
 * 48  cac:Item/cac:ClassifiedTaxCategory/cbc:Percent
 * 49  cac:Item/cac:ClassifiedTaxCategory/cac:TaxScheme/cbc:ID
 * 50  cac:Price/cbc:PriceAmount
 *
 * --- Payment ---
 * 51  cac:PaymentMeans/cbc:PaymentMeansCode
 * 52  cac:PaymentMeans/cbc:PaymentDueDate
 * 53  cac:PaymentMeans/cac:PayeeFinancialAccount/cbc:ID
 *
 * --- References / digital signature ---
 * 54  cac:DocumentReference/cbc:ID       (related document ref, if any)
 * 55  cac:Signature                       (seller digital signature block)
 *
 * Counting note: the exact register varies slightly between NRS guidance
 * versions (some versions fold the signature block differently). Confirm the
 * final 55 against the onboarding pack.
 */

export const NRS_MANDATORY_FIELD_GROUPS = [
  'DocumentEnvelope',
  'Seller',
  'Buyer',
  'TaxTotal',
  'InvoiceTotals',
  'InvoiceLine',
  'PaymentMeans',
  'Signature',
] as const;

export type NrsMandatoryFieldGroup = (typeof NRS_MANDATORY_FIELD_GROUPS)[number];

/** UBL 2.1 namespace for Phase 1 XML building. */
export const UBL_NAMESPACES = {
  cbc: 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2',
  cac: 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2',
} as const;
