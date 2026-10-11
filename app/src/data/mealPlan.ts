// Split out of App.jsx in Phase 2. Behaviour unchanged.

// Personal cut plan (Oct 2026): 86.6kg trend -> 80kg goal at ~0.5kg/wk. Plan content, not user
// data, so it lives in code. Meal macros are approximate; totals are summed at render so the
// displayed day total always matches the meals listed.
export const MEAL_PLAN = {
  goalKg: 80, checkpointKg: 83, targetRate: 0.5,
  targets: {
    train: { kcal: 2100, p: 200, c: 180, f: 65, fibre: '35-40' },
    rest:  { kcal: 1800, p: 200, c: 115, f: 60, fibre: '35-40' },
  },
  days: {
    train_am: [
      { t: '04:30', n: 'Pre-training', food: 'Banana + black coffee', p: 1, c: 27, f: 0 },
      { t: '06:30', n: 'Breakfast', food: '60g oats, 40g whey, 150g berries', p: 37, c: 55, f: 6 },
      { t: '12:30', n: 'Lunch', food: '200g cooked chicken breast, 200g potato, big salad, 1 tbsp olive oil', p: 64, c: 40, f: 19 },
      { t: '16:00', n: 'Snack', food: '250g 0% Greek yoghurt, 15g walnuts', p: 27, c: 10, f: 10 },
      { t: '19:30', n: 'Dinner', food: '200g salmon (white fish 3 nights a week), veg, 120g cooked rice', p: 43, c: 40, f: 26 },
      { t: '21:30', n: 'Evening', food: '200g low-fat cottage cheese or a casein shake', p: 25, c: 7, f: 4 },
    ],
    train_pm: [
      { t: '07:30', n: 'Breakfast', food: '250g 0% Greek yoghurt, 15g walnuts', p: 27, c: 10, f: 10 },
      { t: '12:30', n: 'Lunch', food: '200g cooked chicken breast, 200g potato, big salad, 1 tbsp olive oil', p: 64, c: 40, f: 19 },
      { t: '15:30', n: 'Snack', food: '200g low-fat cottage cheese', p: 25, c: 7, f: 4 },
      { t: '18:00', n: 'Pre-training', food: '60g oats, 40g whey, 150g berries', p: 37, c: 55, f: 6 },
      { t: '19:30', n: 'Top-up', food: 'Banana (skip caffeine this late to protect sleep)', p: 1, c: 27, f: 0 },
      { t: '21:30', n: 'Dinner', food: '200g salmon (white fish 3 nights a week), veg, 120g cooked rice', p: 43, c: 40, f: 26 },
    ],
    rest: [
      { t: '07:30', n: 'Breakfast', food: '30g oats, 40g whey, 150g berries', p: 35, c: 35, f: 4 },
      { t: '12:30', n: 'Lunch', food: '230g cooked chicken breast, big salad, 1 tsp olive oil', p: 72, c: 6, f: 15 },
      { t: '16:00', n: 'Snack', food: '250g 0% Greek yoghurt, 15g walnuts, 1 apple', p: 27, c: 30, f: 10 },
      { t: '19:30', n: 'Dinner', food: '200g salmon (white fish 3 nights a week), veg, 120g cooked rice', p: 43, c: 40, f: 26 },
      { t: '21:30', n: 'Evening', food: '200g low-fat cottage cheese', p: 25, c: 7, f: 4 },
    ],
  },
  rules: [
    ['Losing 0.4-0.7 kg/wk', 'Hold'],
    ['Under 0.3 kg/wk for 2 weeks', 'Cut 150 kcal of rest-day carbs, or add 2,000 steps a day'],
    ['Over 0.9 kg/wk', 'Add 150 kcal of carbs'],
    ['e1RM down 5%+ on 2+ main lifts for 2 weeks', 'Add 150 kcal of carbs on training days and check sleep'],
    ['Already at 1,800 avg, 200g protein, 55g fat', 'Do not cut food further. Add cardio instead'],
  ],
  habits: [
    'Steps: 8-10k a day. Zone 2: 2-3 sessions of 30-40 min a week (mountain biking counts).',
    'Diet break: one week at about 2,450 kcal around week 8, timed with the deload.',
    'HDL: oily fish 2-3 times a week, olive oil and nuts for fat, omega-3 2-3g EPA+DHA a day.',
    'Glucose: keep most carbs around training, high fibre, no big carb loads late at night.',
    'Haematocrit: 3.5-4 litres of water a day.',
    'Supplements: creatine 5g is fine (tell your doctor, it raises creatinine). No extra vitamin D or B12.',
  ],
};
