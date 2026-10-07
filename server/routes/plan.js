// Rutele pentru planul personalizat (mese + sarcini zilnice).
import { validate, rules, todayIn } from '../validate.js';
import { mondayOf } from '../plan/service.js';
import { SLOTS } from '../plan/validate.js';
import { foodOut } from './data.js';
import { HttpError } from '../http.js';
import { getSettings } from '../settings.js';

export function registerPlanRoutes(router, app) {
  const plans = app.plans;

  const weekParam = ctx => {
    const raw = ctx.url.searchParams.get('week') || ctx.body?.week || todayIn(ctx.user.timezone);
    const { week } = validate({ week: raw }, { week: rules.day() });
    return mondayOf(week);
  };

  router.on('GET', '/api/plan', ctx => plans.getWeek(ctx.user, weekParam(ctx)));

  // Comutatorul din setările panoului: generarea cu AI poate fi oprită temporar (planurile existente rămân).
  const aiEnabled = () => {
    if (!getSettings(app.db).featureAiPlans) throw new HttpError(503, 'feature_disabled', 'Generarea planurilor este oprită temporar de echipa Metamorf. Planul existent rămâne disponibil; încearcă mai târziu.');
  };

  router.on('POST', '/api/plan/generate', ctx => {
    aiEnabled();
    return plans.generateWeek(ctx.user, weekParam(ctx), { force: ctx.body.force === true });
  });

  router.on('POST', '/api/plan/replace', async ctx => {
    aiEnabled();
    const d = validate(ctx.body, { day: rules.day(), slot: rules.oneOf(SLOTS) });
    return { meal: await plans.replaceMeal(ctx.user, d.day, d.slot) };
  });

  router.on('POST', '/api/plan/log', ctx => {
    const d = validate(ctx.body, { day: rules.day(), slot: rules.oneOf(SLOTS), portion: rules.num({ min: 0.25, max: 2, decimals: 2 }) });
    ctx.status = 201;
    return foodOut(plans.logMeal(ctx.user, d.day, d.slot, d.portion));
  });

  router.on('PUT', '/api/plan/tasks', ctx => {
    const d = validate(ctx.body, { day: rules.day(), taskId: rules.str({ max: 10 }), done: rules.bool() });
    return plans.setTask(ctx.user, d.day, d.taskId, d.done);
  });
}
