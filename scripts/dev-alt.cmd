@echo off
rem Second dev server for testing beside the main app: own build folder,
rem own database (data\dev-alt.db) and port 3002.
set NEXT_DIST_DIR=.next-alt
set FAMILYTRIP_DB=data\dev-alt.db
call npx.cmd tsx scripts\seed.ts
call npx.cmd next dev -p 3002
