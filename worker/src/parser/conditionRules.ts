import type { ConditionRule } from './types';

export const CONDITION_RULES: ConditionRule[] = [
  {
    category: 'tank_temperature',
    severity: 'watch',
    priority: 10,
    pattern:
      /\b(?:tank|chemical|liquid|methyl methacrylate|mma|temperature)\b.{0,160}\b(\d{1,3})\s?(?:(?:\u00b0?\s?(F|C))|degrees?(?:\s+(Fahrenheit|Celsius))?)\b/i,
    summary: 'Captured tank-temperature-related value from nearby tank/chemical context.',
  },
  {
    category: 'temperature_trend',
    severity: 'watch',
    priority: 9,
    pattern:
      /\b(?:temperature|tank|chemical|liquid)\b.{0,140}\b(stabilized|stable|rising|increasing|cooling|cool(?:ed)?|dropped|maintained)\b/i,
    summary: 'Captured temperature-trend language from nearby tank/chemical context.',
  },
  {
    category: 'temperature_trend',
    severity: 'watch',
    priority: 9,
    pattern: /\b(\d+)\s?degree[s]?\s?per\s?hour\b/i,
    summary: 'Captured reported temperature-change rate.',
  },
  {
    category: 'thermal_runaway',
    severity: 'critical',
    priority: 10,
    pattern: /\bthermal runaway\b|\bcatastrophic failure\b|\bexplosion risk\b|\bexplode\b|\bruptur(?:e|ing)\b/i,
    summary: 'Captured high-risk tank failure or thermal-runaway language.',
  },
  {
    category: 'pressure',
    severity: 'warning',
    priority: 8,
    pattern:
      /\bpressure\b.{0,100}\b(tank|valve|relief|rising|increasing|unstable)\b|\b(tank|valve|relief|unstable)\b.{0,100}\bpressure\b/i,
    summary: 'Captured pressure-related language near tank/valve context.',
  },
  {
    category: 'leak',
    severity: 'warning',
    priority: 8,
    pattern: /\b(active leak|leaking|spill(?:ed|ing)?|chemical release|rupture|breach)\b/i,
    summary: 'Captured release/leak/spill language.',
  },
  {
    category: 'plume',
    severity: 'warning',
    priority: 8,
    pattern: /\b(plume|vapors?|venting vapors?|off[- ]?gassing|gas leak|chemical cloud)\b/i,
    summary: 'Captured plume/vapor/off-gassing language.',
  },
  {
    category: 'air_monitoring',
    severity: 'watch',
    priority: 7,
    pattern:
      /\bair monitoring\b.{0,180}\b(no|not|detected|reading|levels?|safe|unsafe|ongoing|tests?)\b|\b(no|not|detected|reading|levels?|safe|unsafe|ongoing|tests?)\b.{0,180}\bair monitoring\b|\bchemical vapors?\b.{0,140}\b(detected|not detected|no)\b/i,
    summary: 'Captured air-monitoring or vapor-detection language.',
  },
  {
    category: 'containment',
    severity: 'watch',
    priority: 6,
    pattern:
      /\b(containment|berm|storm drain|runoff|dike|divert|contained|holding area)\b.{0,140}\b(chemical|spill|tank|water|runoff|drain|site|ocean|river)\b|\b(chemical|spill|tank|water|runoff|drain|site|ocean|river)\b.{0,140}\b(containment|berm|storm drain|runoff|dike|divert|contained|holding area)\b/i,
    summary: 'Captured containment/runoff/storm-drain language.',
  },
  {
    category: 'cooling',
    severity: 'watch',
    priority: 7,
    pattern:
      /\b(cooling|cool(?:ed)?|water stream|water cannon|spray|hose)\b.{0,160}\b(tank|chemical|temperature|liquid|operation|effort)\b|\b(tank|chemical|temperature|liquid|operation|effort)\b.{0,160}\b(cooling|cool(?:ed)?|water stream|water cannon|spray|hose)\b/i,
    summary: 'Captured cooling-operation language.',
  },
  {
    category: 'neutralization',
    severity: 'watch',
    priority: 7,
    pattern: /\bneutraliz(?:e|ing|ation)\b/i,
    summary: 'Captured neutralization language.',
  },
  {
    category: 'evacuation',
    severity: 'info',
    priority: 3,
    pattern: /\bevacuat(?:e|ion|ed)\b|\bshelter[- ]?in[- ]?place\b/i,
    summary: 'Captured public-instruction language.',
  },
];
