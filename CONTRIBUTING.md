# Contribute an App

Ideas belong in [GitHub Discussions](https://github.com/TedTschopp/busy.tedt.org/discussions/new?category=ideas). Complete local apps arrive as pull requests.

Create `apps/tedt/<lowercase-slug>/` and include:

```text
app.py
manifest.yaml
preview.png (or .gif, .jpg, .webp)
README.md
LICENSE
requirements.txt (when needed)
all supporting files and assets
```

Use this manifest:

```yaml
name: Your App Name
author: your-github-login
description: One or two sentences, no more than 200 characters.
tags:
  - utility
preview: ./preview.png
repo: https://github.com/your-login/your-project
```

The optional `repo` points to the original project. It must be an HTTP or HTTPS URL without credentials. Preserve the BUSY display’s proportions in the preview. Supply clear setup instructions, dependencies, supported connection methods, and operating-system constraints in the README.

Include an MIT license with your attribution. By submitting, you license the app, its preview, and accompanying files under MIT. Do not submit files you lack permission to distribute. Remove personal configuration, passwords, tokens, and other secrets.

Keep the complete runnable folder together. Do not submit symlinks, submodules, absolute paths, or active HTML in documentation. Code examples inside Markdown code fences are fine.

Run `npm test` and `npm run build`. State whether you tested on real hardware, the emulator, or neither; catalog publication is not a hardware-certification claim.

Do not edit `apps/community/` directly. Propose those changes to the original author or [upstream gallery](https://github.com/maxswinkels/busybar-apps). Do not hand-edit generated catalogs, previews, or downloads.
