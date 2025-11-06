# 🌍 Multi-Environment Infrastructure - CDKTF TypeScript

> **Modular CDKTF** for staging + production with remote state management

[![CDKTF](https://img.shields.io/badge/CDKTF-TypeScript-3178C6.svg)](https://www.terraform.io/cdktf)
[![Multi-Env](https://img.shields.io/badge/Multi--Environment-Staging%2BProd-success.svg)](https://aws.amazon.com/)

## 🎯 Problem
Deploy same infrastructure to staging and production with separate state, separate AWS providers, environment-specific configs.

## 💡 Solution
CDKTF TypeScript with Terraform Cloud remote state, modular stacks, S3 versioning, HTTPS-only security groups.

## 🏗️ Architecture

```mermaid
graph TB
    subgraph TerraformCloud["Terraform Cloud - Remote State"]
        State[Shared State Backend]
    end
    
    subgraph Staging["Staging Environment"]
        StagingProvider[AWS Provider<br/>us-west-2]
        StagingS3[S3 Bucket<br/>Versioning Enabled<br/>KMS Encrypted]
        StagingSG[Security Group<br/>HTTPS Only<br/>Port 443]
        StagingCloudWatch[CloudWatch Logs<br/>Monitoring]
    end
    
    subgraph Production["Production Environment"]
        ProdProvider[AWS Provider<br/>us-east-1]
        ProdS3[S3 Bucket<br/>Versioning Enabled<br/>KMS Encrypted]
        ProdSG[Security Group<br/>HTTPS Only<br/>Port 443]
        ProdCloudWatch[CloudWatch Logs<br/>Monitoring]
    end
    
    State -->|Staging Config| StagingProvider
    State -->|Prod Config| ProdProvider
    
    StagingProvider --> StagingS3
    StagingProvider --> StagingSG
    StagingS3 --> StagingCloudWatch
    
    ProdProvider --> ProdS3
    ProdProvider --> ProdSG
    ProdS3 --> ProdCloudWatch
    
    style Staging fill:#E3F2FD
    style Production fill:#FFF3E0
    style TerraformCloud fill:#F3E5F5
```

## 🚀 Quick Deploy
```bash
# Staging
cdktf deploy staging

# Production
cdktf deploy production
```

## 💰 Cost: ~$40-60/month (per environment)
## ⏱️ Deploy: 10-15 minutes

## ✨ Features
- ✅ Staging + Production environments
- ✅ Remote state (Terraform Cloud)
- ✅ Separate AWS providers
- ✅ S3 versioning enabled
- ✅ HTTPS-only security
- ✅ Modular CDKTF code

## 🎯 Perfect For
- Dev/Staging/Prod workflows
- Enterprise deployments
- Team collaboration
- State management

## 👤 Author
**Rahul Ladumor** | rahuldladumor@gmail.com | acloudwithrahul.in

## 📄 License
MIT - Copyright (c) 2025 Rahul Ladumor
