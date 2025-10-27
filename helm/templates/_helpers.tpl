{{/*
Expand the name of the chart.
*/}}
{{- define "kv-responder.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
We truncate at 63 chars because some Kubernetes name fields are limited to this (by the DNS naming spec).
Include tenant to make each deployment independent.
*/}}
{{- define "kv-responder.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- $tenant := .Values.tenant }}
{{- if contains $name .Release.Name }}
{{- printf "%s-%s" .Release.Name $tenant | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s-%s" .Release.Name $name $tenant | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "kv-responder.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "kv-responder.labels" -}}
helm.sh/chart: {{ include "kv-responder.chart" . }}
{{ include "kv-responder.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "kv-responder.selectorLabels" -}}
app.kubernetes.io/name: {{ include "kv-responder.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/tenant: {{ .Values.tenant }}
{{- end }}

{{/*
Create the name of the service account to use
*/}}
{{- define "kv-responder.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "kv-responder.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}