# TODO: Add Age Constraint (18+ years) to Registration

## Steps:
1. Update public/registration.html:
   - Make DOB field required
   - Add client-side JavaScript validation to check age >= 18 on form submit

2. Update server.js:
   - Add server-side validation in /api/register to calculate age from DOB and reject if under 18

## Status:
- [x] Step 1: Edit registration.html
- [x] Step 2: Edit server.js
