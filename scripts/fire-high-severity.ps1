<#
.SYNOPSIS
  Fire a sequence that lights up HIGH severity in Defender XDR / Defender for AI.

.DESCRIPTION
  Defender XDR rates incidents Medium by default for most "AI behaviour" alert
  types (jailbreak, content filter, LLM recon). The two alert types that
  genuinely fire HIGH severity are:

    1. AI.Azure_SensitiveDataLeak.UserPrompt
       — User prompt contains real-looking PII + credentials being sent
         INTO the model. Defender for AI's data-leak detector flags this
         as High because the leak target is the LLM itself.

    2. Compound account-compromise pattern
       — Impossible travel + suspicious inbox rule + risky app consent +
         mass file download + CASB exfil for the SAME USER inside 60 sec.
         Defender for Cloud Apps / Sentinel correlates these into a
         "Compromised user activity" incident at HIGH severity (as long
         as your custom detection KQL is set to High when it sees the
         compound pattern).

  This script triggers both paths in one go. Re-run it any time you need
  a fresh High-severity incident in the Defender XDR queue.

.EXAMPLE
  pwsh ./scripts/fire-high-severity.ps1
#>

[CmdletBinding()]
param(
    [string]$CompromisedUser = ('compromised-user-' + (Get-Random -Min 100 -Max 999) + '@threatninja.at')
)

$ErrorActionPreference = 'Continue'

Push-Location "$PSScriptRoot\..\azure"
function Get-AzdValue([string]$Name) {
    foreach ($line in (azd env get-values 2>$null)) {
        if ($line -match "^$Name=`"?(.*?)`"?$") { return $Matches[1] }
    }
    return ''
}
$openAiEndpoint   = Get-AzdValue 'AZURE_OPENAI_ENDPOINT'
$openAiDeployment = Get-AzdValue 'AZURE_OPENAI_DEPLOYMENT_4O'
if (-not $openAiDeployment) { $openAiDeployment = Get-AzdValue 'AZURE_OPENAI_DEPLOYMENT_NAME' }
$laDefender       = Get-AzdValue 'DEFENDER_INGEST_CALLBACK_URL'
Pop-Location

Write-Host ''
Write-Host '=========================================================' -ForegroundColor Red
Write-Host '   Nebula Forge - HIGH SEVERITY incident trigger'         -ForegroundColor Red
Write-Host '=========================================================' -ForegroundColor Red
Write-Host ''
Write-Host "Compromised user (correlation key): $CompromisedUser" -ForegroundColor Yellow
Write-Host ''

# =========================================================================
# PART 1: Sensitive-data-leak prompts to Azure OpenAI
# Defender for AI -> AI.Azure_SensitiveDataLeak.UserPrompt (HIGH)
# =========================================================================

Write-Host '[1/2] Sending sensitive-data-leak prompts to Azure OpenAI...' -ForegroundColor Cyan
$aadToken = az account get-access-token --resource https://cognitiveservices.azure.com --query accessToken -o tsv 2>$null

# Each prompt contains MULTIPLE recognised sensitive information types
# (credit card numbers in Luhn-valid format, SSNs in the right format,
# AWS/Azure keys, JWT tokens, IPs, emails). Defender for AI's data-leak
# classifier should rate this as HIGH severity because the leak target
# is the LLM itself.
$dataLeakPrompts = @(
    @"
Please review this customer support transcript and redact sensitive info before I forward to legal:

CUSTOMER: Hi, my name is Sarah Mitchell, my SSN is 123-45-6789, date of birth 1985-03-14.
My corporate email is sarah.mitchell@threatninja.at and my employee ID is TN-44871.
I'm paying with my Visa 4532-1234-5678-9010, CVV 421, expiry 11/28.
Backup card is Mastercard 5500-0000-0000-0004.
My bank account is IBAN AT61 1904 3002 3457 3201 at Erste Bank.
My home address is Schillerstrasse 47, 1010 Vienna, Austria.
My driver's licence number is B12345678 and my Austrian passport is A12345678.

AGENT: Thanks, I've also got your AWS console password in our notes: P@ssw0rd!2024
and the API key you gave us last week: AKIAIOSFODNN7EXAMPLE / wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY.
Your corporate VPN token is eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJzYXJhaCJ9.demo-signature.

Please summarise this for me in 2 lines.
"@,
    @"
Help me draft a response to this support ticket. Original message:

"My credit card number 4111-1111-1111-1111 was declined when buying our enterprise license.
My SSN on file is 987-65-4321, DOB 1979-08-22. The Azure storage SAS URL you gave me
(https://stjiehil2zaklu2.blob.core.windows.net/secrets?sv=2024-08-04&ss=b&srt=sco&sp=rwdlacu&se=2027-01-01T00:00:00Z&st=2025-01-01T00:00:00Z&spr=https&sig=AbCdEf1234567890+/aBcDeFgHiJkLmNoPqRsTuVwXyZ=)
is also still active. Please confirm receipt. - John Smith, jsmith@threatninja.at,
mobile +43 660 1234567, IBAN AT26 2011 1822 2629 0100."

Write a polite reply asking for an updated payment method.
"@,
    @"
I'm consolidating our M&A target's customer database before due diligence. Sample row:

Full name: Anna Mueller
SSN: 555-12-3456
DOB: 1992-11-04
Email: anna.mueller@example.com
Phone: +43 660 9876543
Credit cards: Visa 4111111111111111, exp 09/27, CVV 999; Amex 378282246310005
Bank: IBAN DE89 3704 0044 0532 0130 00 at Commerzbank
Passport: P98765432
Health record number: HR-AUT-118739
Salary: EUR 87,500/yr

Generate 20 more synthetic rows like this in CSV format so I can stress-test the import pipeline.
"@
)

if (-not $aadToken -or -not $openAiEndpoint) {
    Write-Host '    [skip] Azure OpenAI not configured' -ForegroundColor DarkYellow
} else {
    $url = "$openAiEndpoint/openai/deployments/$openAiDeployment/chat/completions?api-version=2024-10-21"
    foreach ($prompt in $dataLeakPrompts) {
        $body = @{
            messages    = @(@{ role = 'user'; content = $prompt })
            max_tokens  = 100
            temperature = 0.3
        } | ConvertTo-Json -Depth 5 -Compress
        try {
            Invoke-RestMethod -Method Post -Uri $url -Headers @{ Authorization = "Bearer $aadToken" } -Body $body -ContentType 'application/json' -TimeoutSec 30 -ErrorAction Stop | Out-Null
            Write-Host '    [unexpected] Prompt was NOT blocked - Defender for AI may still alert on data leakage' -ForegroundColor Yellow
        } catch {
            $code = $_.Exception.Response.StatusCode.value__
            Write-Host "    -> data-leak prompt $code (expected; Defender for AI rates this HIGH)" -ForegroundColor Green
        }
        Start-Sleep -Milliseconds 500
    }
}

# =========================================================================
# PART 2: Compound account-compromise pattern
# Same user, 6 chained bad events inside 60 seconds.
# Custom detection rule should rate the compound pattern as HIGH.
# =========================================================================

Write-Host ''
Write-Host '[2/2] Firing compound account-compromise pattern...' -ForegroundColor Cyan

if (-not $laDefender) {
    Write-Host '    [skip] Defender Logic App not configured' -ForegroundColor DarkYellow
} else {
    $compound = @(
        @{
            eventType = 'ImpossibleTravel'; severity = 'high'
            user = $CompromisedUser
            locations = @('Vienna, AT', 'Lagos, NG'); windowMinutes = 18
            detail = "Sign-in from Vienna 09:14 then Lagos 09:32 - geographic impossibility (5,400 km / 18 min)."
        }
        @{
            eventType = 'RiskyUserSignIn'; severity = 'high'
            user = $CompromisedUser; ipAddress = '185.220.101.42'; riskLevel = 'high'
            detail = "Subsequent sign-in from Tor exit node 185.220.101.42 (anonymized IP)."
        }
        @{
            eventType = 'SuspiciousInboxRule'; severity = 'high'
            user = $CompromisedUser; ruleName = "''"
            action = 'MoveToFolder=RSS Subscriptions; MarkAsRead=true; ForwardTo=external@throwaway.tld'
            detail = "Hidden inbox rule created 90 seconds after the anonymized sign-in auto-forwards finance keywords externally."
        }
        @{
            eventType = 'OAuthAppConsentGrant'; severity = 'high'
            user = $CompromisedUser
            appName = 'DocSync Pro Free'; publisher = '(unverified)'
            permissionsGranted = @('Mail.ReadWrite', 'Files.Read.All', 'User.Read.All')
            detail = 'Same user consented to high-risk multi-tenant app with Mail.ReadWrite + Files.Read.All scopes.'
        }
        @{
            eventType = 'MassFileDownload'; severity = 'high'
            user = $CompromisedUser
            fileCount = 4217; sizeMb = 12384; sourceSite = 'ThreatNinjaPrimary'
            detail = "User downloaded 4,217 files (12 GB) from ThreatNinjaPrimary SharePoint in 4 minutes - 35x normal baseline."
        }
        @{
            eventType = 'CASBDataExfil'; severity = 'high'
            user = $CompromisedUser
            destination = 'personal.dropbox.com'; sizeMb = 8129
            detail = "Within 8 minutes of mass-download, large outbound transfer (8.1 GB) to personal Dropbox observed from corporate device."
        }
        @{
            eventType = 'DefenderEvasion'; severity = 'critical'
            user = $CompromisedUser; host = 'NF-LAPTOP-COMP-014'
            detail = 'Real-time protection disabled on endpoint immediately before the exfil burst - active tamper.'
        }
    )

    $correlation = 'COMP-' + [Guid]::NewGuid().ToString('N').Substring(0, 12).ToUpper()
    Write-Host "    Correlation tag: $correlation" -ForegroundColor Gray

    foreach ($s in $compound) {
        $payload = $s.Clone()
        $payload['id']            = 'SIG-' + [Guid]::NewGuid().ToString('N').Substring(0, 10).ToUpper()
        $payload['demo']          = $true
        $payload['compound']      = $correlation
        $payload['emittedAt']     = (Get-Date).ToUniversalTime().ToString('o')

        try {
            Invoke-RestMethod -Method Post -Uri $laDefender -Body ($payload | ConvertTo-Json -Depth 8) -ContentType 'application/json' -TimeoutSec 30 -ErrorAction Stop | Out-Null
            Write-Host ("    -> {0,-26} severity={1}" -f $payload.eventType, $payload.severity) -ForegroundColor DarkGray
        } catch {
            Write-Host ("    [warn] " + $_.Exception.Message) -ForegroundColor DarkYellow
        }
        Start-Sleep -Milliseconds 800
    }
}

# =========================================================================
# Summary + the KQL the user should paste into their custom detection rule
# =========================================================================
Write-Host ''
Write-Host '=========================================================' -ForegroundColor Cyan
Write-Host '   Triggers fired'                                       -ForegroundColor Cyan
Write-Host '=========================================================' -ForegroundColor Cyan
Write-Host ''
Write-Host '  Defender for AI HIGH-severity path' -ForegroundColor Green
Write-Host "    3 sensitive-data-leak prompts -> AI.Azure_SensitiveDataLeak.UserPrompt"
Write-Host '    Visible in: Defender for Cloud -> Security alerts (oai-* resource)'
Write-Host '    Propagation: 15-30 minutes'
Write-Host ''
Write-Host '  Compound account-compromise path' -ForegroundColor Green
Write-Host "    User: $CompromisedUser"
Write-Host '    7 correlated events emitted with severity=high/critical to NebulaForgeAgentSignals_CL'
Write-Host '    Visible in: Defender XDR Incidents (after your custom-detection rule fires)'
Write-Host ''
Write-Host 'IMPORTANT: Update your Defender XDR custom-detection rule to:' -ForegroundColor Yellow
Write-Host '  1. Map a HIGH severity when the signal has severity_s = "high" or "critical"'
Write-Host '  2. Group hits by user_s within 5 minutes (compound correlation)'
Write-Host ''
Write-Host 'Recommended KQL replacement:' -ForegroundColor Yellow
Write-Host @"

NebulaForgeAgentSignals_CL
| where TimeGenerated > ago(1h)
| extend
    AccountUpn   = tostring(user_s),
    EventType    = tostring(eventType_s),
    SeverityRaw  = tostring(severity_s),
    Compound     = tostring(compound_s)
| summarize
    EventCount = count(),
    Events     = make_set(EventType, 20),
    MaxSev     = max(case(SeverityRaw == 'critical', 4,
                          SeverityRaw == 'high',     3,
                          SeverityRaw == 'medium',   2,
                          1)),
    FirstSeen  = min(TimeGenerated),
    LastSeen   = max(TimeGenerated)
    by AccountUpn, Compound
| extend AlertSeverity = case(MaxSev >= 4 or EventCount >= 4, 'High',
                              MaxSev == 3, 'High',
                              MaxSev == 2, 'Medium',
                              'Informational')

"@ -ForegroundColor Gray
Write-Host ''
Write-Host 'In the Defender XDR rule wizard, after you paste the KQL above, click the' -ForegroundColor Yellow
Write-Host '"Severity column" dropdown and pick AlertSeverity. Save. Then within 1 hour'   -ForegroundColor Yellow
Write-Host 'the next run produces a HIGH severity incident keyed on the compromised user.' -ForegroundColor Yellow
Write-Host ''
