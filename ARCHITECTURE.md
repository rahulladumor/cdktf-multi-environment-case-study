# Architecture Diagrams - Multi-Environment Infrastructure

Comprehensive Mermaid diagrams for the infrastructure.

## 1. Overall Architecture

```mermaid
graph TB
    subgraph Users
        Client[Users/Clients]
    end
    
    subgraph AWS Cloud
        VPC[VPC<br/>Multi-AZ]
        ALB[Load Balancer<br/>High Availability]
        EC2[EC2 Instances<br/>Auto Scaling]
        DB[Database<br/>Multi-AZ]
        S3[S3 Storage<br/>Encrypted]
    end
    
    subgraph Monitoring
        CW[CloudWatch<br/>Metrics & Logs]
    end
    
    Client --> ALB
    ALB --> EC2
    EC2 --> DB
    EC2 --> S3
    EC2 --> CW
```

## 2. Network Architecture

```mermaid
graph LR
    subgraph VPC
        subgraph Public Subnets
            Pub1[Public Subnet AZ-A]
            Pub2[Public Subnet AZ-B]
        end
        
        subgraph Private Subnets
            Priv1[Private Subnet AZ-A]
            Priv2[Private Subnet AZ-B]
        end
        
        IGW[Internet Gateway]
        NAT[NAT Gateway]
    end
    
    IGW --> Pub1
    IGW --> Pub2
    Pub1 --> NAT
    NAT --> Priv1
    NAT --> Priv2
```

## 3. Security Architecture

```mermaid
graph TB
    subgraph Security Layers
        WAF[WAF<br/>Web Application Firewall]
        SG[Security Groups<br/>Firewall Rules]
        NACL[Network ACLs<br/>Subnet Protection]
        IAM[IAM Roles<br/>Access Control]
        KMS[KMS Encryption<br/>Data Protection]
    end
    
    WAF --> SG
    SG --> NACL
    NACL --> IAM
    IAM --> KMS
```

## 4. Data Flow

```mermaid
sequenceDiagram
    participant User
    participant LB as Load Balancer
    participant App as Application
    participant DB as Database
    participant S3 as S3 Storage
    
    User->>LB: 1. Request
    LB->>App: 2. Route
    App->>DB: 3. Query Data
    DB-->>App: 4. Return Data
    App->>S3: 5. Store Files
    S3-->>App: 6. Confirm
    App-->>LB: 7. Response
    LB-->>User: 8. Return
```

## 5. Auto-Scaling

```mermaid
graph TB
    subgraph Metrics
        CPU[CPU Utilization<br/>>70%]
        Memory[Memory Usage<br/>>80%]
    end
    
    subgraph Auto Scaling
        ASG[Auto Scaling Group<br/>Min: 2, Max: 10]
        ScaleOut[Scale Out<br/>+1 Instance]
        ScaleIn[Scale In<br/>-1 Instance]
    end
    
    CPU --> ScaleOut
    Memory --> ScaleOut
    ScaleOut --> ASG
    ScaleIn --> ASG
```

## 6. Monitoring & Alerts

```mermaid
graph LR
    subgraph Resources
        EC2[EC2 Instances]
        RDS[RDS Database]
        ALB[Load Balancer]
    end
    
    subgraph CloudWatch
        Metrics[Metrics]
        Logs[Logs]
        Alarms[Alarms]
    end
    
    subgraph Notifications
        SNS[SNS Topic]
        Email[Email Alerts]
    end
    
    EC2 --> Metrics
    RDS --> Metrics
    ALB --> Metrics
    
    EC2 --> Logs
    Metrics --> Alarms
    Alarms --> SNS
    SNS --> Email
```

## 7. Deployment Flow

```mermaid
graph LR
    A[Source Code] --> B[Build]
    B --> C[Test]
    C --> D[Package]
    D --> E[Deploy Dev]
    E --> F[Deploy Staging]
    F --> G[Deploy Production]
```

## 8. Cost Distribution

```mermaid
pie title Monthly Cost Breakdown
    "EC2 Instances" : 40
    "RDS Database" : 30
    "Load Balancer" : 15
    "S3 Storage" : 5
    "Data Transfer" : 5
    "CloudWatch" : 5
```

---

## Key Features

- **High Availability**: Multi-AZ deployment
- **Auto Scaling**: Based on metrics
- **Security**: WAF, Security Groups, Encryption
- **Monitoring**: CloudWatch metrics and alarms
- **Cost Optimized**: Right-sized resources

---

**Author**: Rahul Ladumor  
**License**: MIT 2025
