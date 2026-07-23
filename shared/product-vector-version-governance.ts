export interface ProductVectorComparisonEvidence {
  snapshotAt?: string;
  versions?: { from?: string; to?: string };
  criteria?: { passed?: boolean };
}

export interface ProductVectorVersionGovernance {
  passed: boolean;
  detail: string;
  transitionRequired: boolean;
}

export function evaluateProductVectorVersionGovernance(input: {
  snapshotAt: string;
  currentVersion?: string;
  previousVersion?: string;
  comparison: ProductVectorComparisonEvidence | null;
  comparisonPath: string;
}): ProductVectorVersionGovernance {
  const { snapshotAt, currentVersion, previousVersion, comparison, comparisonPath } = input;

  if (!currentVersion) {
    return { passed: false, transitionRequired: false, detail: 'El snapshot no declara una versión vectorial' };
  }

  const transitionRequired = Boolean(previousVersion && previousVersion !== currentVersion);
  if (!transitionRequired) {
    return {
      passed: true,
      transitionRequired: false,
      detail: previousVersion
        ? `Motor ${currentVersion} sin cambio respecto del snapshot activo; no corresponde repetir una comparación de versiones`
        : `Motor activo ${currentVersion}; no hay una transición candidata que auditar`,
    };
  }

  const passed = comparison?.snapshotAt === snapshotAt
    && comparison.versions?.from === previousVersion
    && comparison.versions?.to === currentVersion
    && comparison.criteria?.passed === true;
  return {
    passed,
    transitionRequired: true,
    detail: comparison
      ? `${comparison.versions?.from ?? '?'} → ${comparison.versions?.to ?? '?'} · ${comparison.criteria?.passed ? 'aprobada' : 'no aprobada'}`
      : `Falta ${comparisonPath}`,
  };
}
