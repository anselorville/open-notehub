# Agent Notes

## Browser Validation

- `browser-use` is installed in the repo-local virtual environment.
- When browser automation or browser verification is needed during development, use the `.venv` environment instead of assuming a global install.
- Preferred command on this project: `.\.venv\Scripts\browser-use.exe`
- Activation command for PowerShell: `.\.venv\Scripts\Activate.ps1`
- Activation command for `cmd`: `.\.venv\Scripts\activate.bat`
- Before browser-driven validation, run `.\.venv\Scripts\browser-use.exe doctor` if availability is uncertain.
- Equivalent `cmd` usage:
  `.\.venv\Scripts\activate.bat && .\.venv\Scripts\browser-use.exe doctor`
- Treat this as the default path for future browser-use based verification work in this repository.
