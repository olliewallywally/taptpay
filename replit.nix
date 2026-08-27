{pkgs}:
let
  # Replit processes inherit CAP_KILL. Bubblewrap rejects any inherited
  # capability unless it is installed setuid, so clear inherited/ambient
  # capabilities before starting the real binary.
  nestedBwrap = pkgs.writeShellScriptBin "bwrap" ''
    exec ${pkgs.util-linux}/bin/setpriv \
      --ambient-caps=-all \
      --inh-caps=-all \
      ${pkgs.bubblewrap}/bin/bwrap "$@"
  '';
in {
  deps = [
    pkgs.mailutils
    pkgs.zip
    pkgs.chromium
    pkgs.glib
    nestedBwrap
    pkgs.socat
  ];
}
