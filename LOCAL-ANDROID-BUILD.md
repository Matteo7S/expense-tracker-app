# Local Play Console builds

Run `npm run build:android:play:local` from a clean, committed working tree.
Set `JAVA_HOME` to a compatible JDK and `ANDROID_HOME` (and `ANDROID_SDK_ROOT`)
to your Android SDK installation. Node 22.18.0 matches the cloud profile.

The command runs the same preflight suite as cloud builds, uses the production
API endpoints, increments the remote Android versionCode and compiles locally.
EAS still requires network access for authentication, existing signing credentials
and dependency downloads, but does not queue a cloud build.

Signing uses the existing EAS-managed upload keystore. `--freeze-credentials`
prevents creation or replacement of credentials. Never use the checked-in debug
keystore for Play releases or commit downloaded signing credentials.

Output: `release-artifacts/wel-fy-local.aab` (ignored by git). After the build,
verify archive integrity and compare its signing certificate SHA-256 with a
previous accepted release using `keytool -printcert -jarfile <bundle.aab>`.
Archive the result with its actual versionCode before starting another build.

The cloud fallback remains `npm run build:android:play`.
