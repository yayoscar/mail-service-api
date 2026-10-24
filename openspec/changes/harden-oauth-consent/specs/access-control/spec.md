## MODIFIED Requirements

### Requirement: Endpoints públicos

Los endpoints del flujo de consentimiento OAuth2 (`/auth/consent`, `/auth/callback`) y la documentación (`/docs`) SHALL ser accesibles sin cabeceras de autenticación, porque se abren desde un navegador. `/auth/consent` MUST exigir en su lugar un token de enlace de consentimiento válido emitido por el administrador, y `/auth/callback` MUST exigir un `state` correspondiente a una solicitud de consentimiento vigente.

#### Scenario: Acceso al flujo de consentimiento

- **WHEN** un navegador abre `/auth/consent?token=<token>` con un token vigente y sin cabeceras de autenticación
- **THEN** la petición se procesa sin exigir API key

#### Scenario: Acceso al flujo de consentimiento sin enlace

- **WHEN** un navegador abre `/auth/consent` sin un token de enlace válido
- **THEN** la petición se rechaza con estado 400 y no se inicia el flujo OAuth2
