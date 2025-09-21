# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.x     | ✅ Yes             |
| < 1.0   | ❌ No              |

## Reporting a Vulnerability

**Please report security vulnerabilities privately.**

📧 **Email**: chocodrop.security@gmail.com
⏱️ **Response**: We aim to respond within 48 hours
🔍 **Assessment**: Initial security assessment within 7 days

### What to Include
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

## Security Considerations

### For Users
- **Never expose AI API keys** in client-side code
- **Validate 3D content sources** to prevent malicious model injection
- **Use Content Security Policy (CSP)** to restrict resource loading
- **Sanitize natural language inputs** before processing

### For Developers
- **MCP Protocol**: Be aware of command execution boundaries
- **WebGL Security**: Validate shader code and 3D assets
- **Server-side**: Secure API endpoints and rate limiting

## Safe Integration Practices

```javascript
// ✅ Good: Server-side API key management
const chocoDrop = createChocoDrop(scene, {
  serverUrl: 'https://your-secure-server.com/api'
});

// ❌ Bad: Client-side API key exposure
const chocoDrop = createChocoDrop(scene, {
  apiKey: 'your-secret-key' // Never do this!
});
```

## Updates

Security updates will be published as patch releases and announced in:
- GitHub Security Advisories
- Release notes
- Community channels

Thank you for helping keep ChocoDrop secure! 🔒