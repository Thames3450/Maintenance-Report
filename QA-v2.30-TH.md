# QA v2.30

- Database migration `mobile_notifications_core_v230`: PASS
- `notification_preferences`: 27 profiles seeded on Live at install time
- `notification_department_subscriptions`: Admin department routes seeded
- `maintenance_tasks.assigned_shift`: PASS
- Edge Function `dispatch-maintenance-notification`: ACTIVE / verify_jwt=true
- React/JS syntax parse using TypeScript transpileModule: PASS
- Service worker JS syntax: PASS
- Repair/PM module source: no direct edits in v2.30
- Full `npm run build` was not executed in this container because npm dependencies were not available offline; source-level syntax validation passed.

One external setup item remains: set Edge Function Secret `VAPID_PRIVATE_KEY` before testing real push delivery.
