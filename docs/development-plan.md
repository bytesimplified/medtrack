# Development stages and functional requirements

MedTrack's initial implementation is complete. The stages below describe the
work by capability; GitHub pull request numbers are not development identifiers.
Physical-device validation and release signing remain on the
[release checklist](release-checklist.md).

## Development stages

| Stage                          | Deliverable                                                                                        | Status                                  |
| ------------------------------ | -------------------------------------------------------------------------------------------------- | --------------------------------------- |
| Project foundation             | React, Vite, TypeScript, formatting, lint, unit tests, and CI                                      | Complete                                |
| App layout and navigation      | Today, Medicines, Insights, reusable controls, and light/dark themes                               | Complete                                |
| Local database and models      | Dexie, versioned schema, and medicine/schedule/dose/stock models                                   | Complete                                |
| Scheduling engine              | Recurrence rules, meal windows, reminder times, date and timezone handling                         | Complete                                |
| Medicine management            | Registration, editing, multiple dose schedules, pause, and archive                                 | Complete                                |
| Daily dashboard                | Today's occurrences, timing groups, progress, and empty states                                     | Complete                                |
| Dose tracking                  | Taken/Skip/Later, correction history, atomic stock deductions, and Undo                            | Complete                                |
| Stock management               | Refills, adjustments, supply forecasts, history, and low-stock detection                           | Complete                                |
| Reminders                      | Browser/native notifications, permissions, snooze, and duplicate-alert prevention                  | Complete                                |
| History and analytics          | Calendar, medicine history, counts, and adherence                                                  | Complete                                |
| Automated E2E coverage         | Browser journeys for medicines, doses, stock, reminders, history, and backup                       | Complete                                |
| Android integration            | Capacitor, app identity/permissions, debug APK CI, emulator checks, and signing guide              | Complete                                |
| Backup and release preparation | Export/restore, migrations, offline recovery, error handling, accessibility, and release checklist | Complete; device/release checks pending |

## Functional requirements

| ID        | Requirement                                                                           | Status                                   |
| --------- | ------------------------------------------------------------------------------------- | ---------------------------------------- |
| FR01      | Register medicine name, strength, description, dose quantity, unit, and initial stock | Implemented                              |
| FR02      | Daily, alternate-day, selected-weekday, and every-X-days schedules                    | Implemented                              |
| FR03      | Meal windows or custom times, multiple daily doses, and start/end dates               | Implemented                              |
| FR04      | Today's scheduled medicines, grouped by timing with progress and stock                | Implemented                              |
| FR05      | Taken, Skipped, and Later actions; Later snoozes reminders without deducting stock    | Implemented                              |
| FR06      | Deduct stock only on confirmed Taken with atomic, idempotent updates                  | Implemented                              |
| FR07      | Refills, adjustments, reconciliation, and refill history                              | Implemented                              |
| FR08      | Scheduled reminders, permission handling, snooze, and rescheduling                    | Implemented; phone checks pending        |
| FR09      | Low-stock alerts with duplicate-warning prevention                                    | Implemented                              |
| FR10      | Daily dose history with timestamps and correction audit trail                         | Implemented                              |
| FR11      | Calendar, weekly/monthly adherence, and medicine-specific history                     | Implemented                              |
| FR12      | Edit, pause, and archive medicines/schedules while preserving history                 | Implemented                              |
| FR13      | Undo incorrect dose entries and reverse the matching stock transaction                | Implemented                              |
| FR14      | Estimate remaining supply and stock-out date from upcoming schedules                  | Implemented                              |
| FR15      | Local persistence and offline access without a mandatory account                      | Implemented                              |
| UX01      | Responsive navigation, reusable controls, light/dark themes, and accessible layouts   | Implemented; device review pending       |
| DATA01    | Versioned JSON backup/restore and database migrations                                 | Implemented                              |
| QA01      | Formatting, lint, typecheck, domain/component tests, and browser E2E in CI            | Implemented                              |
| ANDROID01 | Capacitor integration, automated debug APK builds, and emulator launch checks         | Implemented                              |
| RELEASE01 | Physical-device validation and release signing                                        | Guides ready; validation/signing pending |

## Data rules

- Calculate stock from an append-only transaction ledger.
- Apply related dose, audit-event, and stock writes atomically; prevent duplicate deductions.
- Preserve historical schedule quantities and events when schedules change.
- Keep past pending doses unconfirmed, distinct from explicitly skipped doses.
- Never silently create negative stock; request a refill or explicit reconciliation.
- Calculate historical adherence from completed dates and exclude future doses.
- Snoozing changes reminder timing, not stock or the dose's final status.

## Maintaining the plan

Update the affected requirement/stage status and validation evidence as work
progresses. Keep feature scope stable unless a scope change is agreed. Release
readiness requires completing the physical-device and signing checklist.
