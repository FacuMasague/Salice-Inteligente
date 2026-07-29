export interface BrandProductAnalysis {
  productId: string;
  productName: string;
  netAmount: number;
  kilos: number;
  units: number;
  buyers: number;
}

export interface BrandAnalysisRow {
  name: string;
  netAmount: number;
  kilos: number;
  units: number;
  buyers: number;
  salesSharePercent: number;
  kiloSharePercent: number;
  products: BrandProductAnalysis[];
}

export interface BrandAnalysisPayload {
  generatedAt: string;
  sourceSystem: string;
  sourceMaxDate: string;
  coverageFrom: string;
  unavailableDocumentCount: number;
  productsWithoutKiloConversion: number;
  windowDays: 90;
  range: { from: string; through: string };
  totals: { netAmount: number; kilos: number; units: number; buyers: number };
  brands: BrandAnalysisRow[];
  rules: {
    documents: string;
    missingBrand: string;
    coverage: string;
    kilos: string;
  };
}
