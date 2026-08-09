# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.7.x   | :white_check_mark: |
| < 0.7   | :x:                |

## Reporting a Vulnerability

We take security vulnerabilities seriously. If you discover a security issue, please report it responsibly and privately.

### Preferred: GitHub private vulnerability reporting

Use the **"Report a vulnerability"** button on the repository's **Security** tab (private, no public exposure).
It lets you describe the issue directly to the maintainers.

### Alternative: email

1. **Do NOT** create a public GitHub issue for security vulnerabilities
2. Email security concerns to: security@lmwebui.com
3. Include the following in your report:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Any suggested fixes (optional)

### Coordinated disclosure

We ask that you allow us a reasonable embargo (up to 90 days) before public disclosure so a patched version
can be released. We will keep you informed and credit you in the advisory unless you prefer anonymity.

### What to Expect

- **Acknowledgment**: We will acknowledge receipt of your report within 48 hours
- **Initial Assessment**: A security team member will assess the vulnerability and severity
- **Updates**: We will keep you informed of our progress
- **Resolution**: Once fixed, we will:
  - Credit you in our security advisory (unless you prefer anonymity)
  - Release a patched version
  - Publish a security advisory on GitHub

### Security Acknowledgement

We appreciate every reporter. Contributors of verified security fixes are credited in:

- The GitHub **Security Advisories** page
- Release notes and the [CHANGELOG](./CHANGELOG.md)
- The project's contributors list

### Scope

Security issues in the following areas are in scope:
- Authentication and authorization bypasses
- Injection vulnerabilities (SQL, command, etc.)
- Data exposure or leakage
- Privilege escalation
- Denial of service attacks
- Installer script security issues
- Container security vulnerabilities

### Out of Scope

- Social engineering attacks
- Physical security issues
- Vulnerabilities in third-party dependencies (report to upstream)
- Denial of service caused by excessive resource consumption during normal use

## Security Best Practices for Deployment

### Installer Security
- Never run installer scripts with root unless necessary
- Verify checksums of downloaded artifacts
- Use environment variables for secrets, never hardcode
- Review installer scripts before execution

### Container Security
- Run containers with minimal privileges
- Use read-only root filesystems where possible
- Regularly update base images
- Scan images with Trivy or similar tools

### Network Security
- Enable TLS in production
- Restrict access to management ports
- Use firewall rules to limit exposure
- Consider VPN for remote access

### Authentication
- Use strong JWT secret keys (minimum 256 bits)
- Rotate secrets regularly
- Enable audit logging
- Implement rate limiting

## Known Limitations

- Hardware acceleration features require appropriate driver permissions
