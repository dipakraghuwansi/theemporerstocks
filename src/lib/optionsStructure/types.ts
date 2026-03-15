export type OptionType = 'CE' | 'PE';

export type GammaRegime = 'stabilizing' | 'expansive' | 'neutral' | 'unavailable';
export type VolSkewRegime = 'put_fear' | 'call_chasing' | 'balanced' | 'unavailable';
export type FlowGreekRegime = 'supportive' | 'dragging' | 'balanced' | 'unavailable';
export type FuturesBuildupState = 'long_buildup' | 'short_buildup' | 'short_covering' | 'long_unwinding' | 'neutral' | 'unavailable';

export interface OptionContractMeta {
  instrument: string;
  instrumentToken: number;
  underlying: string;
  expiry: string;
  strike: number;
  lotSize: number;
  optionType: OptionType;
}

export interface FutureContractMeta {
  instrument: string;
  instrumentToken: number;
  underlying: string;
  expiry: string;
  lotSize: number;
}

export interface OptionStrikeSummary {
  strike: number;
  callOi: number;
  putOi: number;
  callOiChange: number;
  putOiChange: number;
  callIv: number | null;
  putIv: number | null;
  netGammaExposure: number;
}

export interface OptionStructureSummary {
  available: boolean;
  reason?: string;
  underlying: string;
  expiry: string | null;
  underlyingPrice: number;
  atmStrike: number | null;
  strikeCount: number;
  totalCallOi: number;
  totalPutOi: number;
  totalCallOiChange: number;
  totalPutOiChange: number;
  putCallRatio: number | null;
  netGammaExposure: number;
  grossGammaExposure: number;
  gammaSkew: number | null;
  gammaRegime: GammaRegime;
  netVannaExposure: number;
  netCharmExposure: number;
  vannaRegime: FlowGreekRegime;
  charmRegime: FlowGreekRegime;
  averageCallIv: number | null;
  averagePutIv: number | null;
  volSkew: number | null;
  volSkewRegime: VolSkewRegime;
  gammaFlipLevel: number | null;
  callWall: number | null;
  putWall: number | null;
  nearestResistance: number | null;
  nearestSupport: number | null;
  nearestResistanceDistancePct: number | null;
  nearestSupportDistancePct: number | null;
  dominantOiFlow: 'calls_building' | 'puts_building' | 'balanced' | 'unavailable';
  futuresPrice: number | null;
  futuresOi: number | null;
  futuresOiChange: number | null;
  futuresPriceChangePct: number | null;
  futuresBuildup: FuturesBuildupState;
  topCallOis: Array<{ strike: number; oi: number }>;
  topPutOis: Array<{ strike: number; oi: number }>;
  strikeSummaries: OptionStrikeSummary[];
  optionsAdjustmentHint: number;
  interpretation: string;
}

export interface OptionStructureRequest {
  symbol: string;
  spotPrice: number;
}
