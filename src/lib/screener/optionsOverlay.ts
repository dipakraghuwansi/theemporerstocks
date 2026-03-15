import { OptionStructureSummary } from '@/lib/optionsStructure/types';
import { StockScreenType } from '@/lib/stockUniverse';
import { ScreenerBaseMetrics, ScreenerScorePayload } from '@/lib/screener/types';

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function getOptionsAdjustment(
  screen: StockScreenType,
  metrics: ScreenerBaseMetrics,
  payload: ScreenerScorePayload
) {
  const options = payload.optionStructureContext?.[metrics.symbol] || null;

  if (!options || !options.available) {
    return {
      optionsAdjustment: 0,
      optionsStructure: options,
    };
  }

  const calibration = payload.calibrationContext[screen]?.optionsMultiplier ?? 1;

  const atr = metrics.atr14 || Math.max(metrics.lastPrice * 0.01, 1);
  const resistanceAtr =
    options.nearestResistance !== null ? (options.nearestResistance - metrics.lastPrice) / atr : null;
  const supportAtr =
    options.nearestSupport !== null ? (metrics.lastPrice - options.nearestSupport) / atr : null;
  const wallPenalty =
    resistanceAtr !== null && resistanceAtr >= 0 && resistanceAtr <= 1
      ? -2
      : supportAtr !== null && supportAtr >= 0 && supportAtr <= 1
        ? 1.5
        : 0;

  let optionsAdjustment = 0;
  let futuresAdjustment = 0;

  switch (screen) {
    case 'intraday-momentum':
    case 'breakout-watchlist':
      optionsAdjustment =
        options.gammaRegime === 'expansive'
          ? Math.abs(options.optionsAdjustmentHint)
          : options.gammaRegime === 'stabilizing'
            ? -Math.abs(options.optionsAdjustmentHint)
            : 0;
      break;
    case 'mean-reversion':
      optionsAdjustment =
        options.gammaRegime === 'stabilizing'
          ? Math.abs(options.optionsAdjustmentHint)
          : options.gammaRegime === 'expansive'
            ? -Math.abs(options.optionsAdjustmentHint)
            : 0;
      break;
    case 'swing-setups':
      optionsAdjustment = options.gammaRegime === 'expansive' ? 2.5 : options.gammaRegime === 'stabilizing' ? -1.5 : 0;
      break;
  }

  switch (screen) {
    case 'intraday-momentum':
    case 'breakout-watchlist':
      futuresAdjustment =
        options.futuresBuildup === 'long_buildup' || options.futuresBuildup === 'short_covering'
          ? 3
          : options.futuresBuildup === 'short_buildup' || options.futuresBuildup === 'long_unwinding'
            ? -3
            : 0;
      break;
    case 'mean-reversion':
      futuresAdjustment =
        options.futuresBuildup === 'short_covering'
          ? 2.5
          : options.futuresBuildup === 'long_buildup'
            ? -1.5
            : options.futuresBuildup === 'short_buildup'
              ? -2
              : 0;
      break;
    case 'swing-setups':
      futuresAdjustment =
        options.futuresBuildup === 'long_buildup'
          ? 2.5
          : options.futuresBuildup === 'short_covering'
            ? 1.5
            : options.futuresBuildup === 'short_buildup'
              ? -2.5
              : options.futuresBuildup === 'long_unwinding'
                ? -1.5
                : 0;
      break;
  }

  if (options.putCallRatio !== null) {
    optionsAdjustment += clamp((options.putCallRatio - 1) * 2, -1.5, 1.5);
  }

  if (options.volSkew !== null) {
    switch (screen) {
      case 'mean-reversion':
        optionsAdjustment += options.volSkewRegime === 'put_fear' ? 1.5 : options.volSkewRegime === 'call_chasing' ? -1 : 0;
        break;
      case 'intraday-momentum':
      case 'breakout-watchlist':
        optionsAdjustment += options.volSkewRegime === 'call_chasing' ? 1.5 : options.volSkewRegime === 'put_fear' ? -1.5 : 0;
        break;
      case 'swing-setups':
        optionsAdjustment += options.volSkewRegime === 'call_chasing' ? 1 : options.volSkewRegime === 'put_fear' ? -0.75 : 0;
        break;
    }
  }

  if (options.vannaRegime !== 'unavailable') {
    if (screen === 'intraday-momentum' || screen === 'breakout-watchlist') {
      optionsAdjustment += options.vannaRegime === 'supportive' ? 1 : options.vannaRegime === 'dragging' ? -1 : 0;
    } else if (screen === 'mean-reversion') {
      optionsAdjustment += options.vannaRegime === 'dragging' ? 0.75 : 0;
    }
  }

  if (options.charmRegime !== 'unavailable') {
    if (screen === 'swing-setups') {
      optionsAdjustment += options.charmRegime === 'supportive' ? 1 : options.charmRegime === 'dragging' ? -1 : 0;
    } else if (screen === 'intraday-momentum') {
      optionsAdjustment += options.charmRegime === 'supportive' ? 0.75 : options.charmRegime === 'dragging' ? -0.75 : 0;
    }
  }

  optionsAdjustment += wallPenalty + futuresAdjustment;

  return {
    optionsAdjustment: Number(clamp(optionsAdjustment * calibration, -8, 8).toFixed(1)),
    optionsStructure: options,
  };
}
