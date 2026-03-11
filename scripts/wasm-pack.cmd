@echo off
:: Ensure cargo bin is in PATH regardless of shell session state
set PATH=%USERPROFILE%\.cargo\bin;%PATH%
wasm-pack %*

