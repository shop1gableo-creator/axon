; Étapes ajoutées à l'installateur / désinstallateur Windows d'Axon (NSIS, via electron-builder).

!macro customUnInstall
  ; Débrancher Axon de Claude Desktop et Claude Code (les autres connecteurs de Claude ne sont pas touchés).
  ; Le cerveau (les notes, dans le Drive ou sur le PC) n'est JAMAIS supprimé.
  ExecWait '"$INSTDIR\Axon.exe" --debrancher'
  ; Préférence « carte graphique hautes performances » posée par Axon.
  DeleteRegValue HKCU "Software\Microsoft\DirectX\UserGpuPreferences" "$INSTDIR\Axon.exe"
!macroend
