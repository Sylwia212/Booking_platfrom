# Platforma Rezerwacyjna - Aplikacja Mikroserwisowa

## Opis Projektu

Platforma Rezerwacyjna to aplikacja oparta na architekturze mikroserwisowej, umożliwiająca użytkownikom przeglądanie ofert, dokonywanie rezerwacji oraz zarządzanie nimi.


## Architektura

Aplikacja składa się z następujących mikroserwisów i komponentów:

  * **Frontend (`booking-ui`):** Interfejs użytkownika napisany w HTML, CSS i waniliowym JavaScript, serwowany przez Nginx. Odpowiedzialny za interakcję z użytkownikiem.
  * **API Gateway (`booking-api`):** Pojedynczy punkt wejścia do systemu, przekierowuje żądania do odpowiednich mikroserwisów backendowych. Napisany w Node.js.
  * **Serwis Użytkownika (`user-service`):** Odpowiedzialny za rejestrację, logowanie i zarządzanie użytkownikami. Napisany w Node.js.
  * **Główny Serwis Rezerwacji (`booking-core-service`):** Odpowiedzialny za logikę biznesową związaną z ofertami i rezerwacjami. Napisany w Node.js.
  * **Baza Danych (`postgresql`):** Relacyjna baza danych PostgreSQL do przechowywania danych użytkowników, rezerwacji itp.
  * **Pamięć Podręczna (`redis`):** Baza danych klucz-wartość Redis, używana np. do przechowywania sesji lub cachowania.
  * **System Kolejkowy (`rabbitmq`):** Używany do asynchronicznej komunikacji między serwisami lub przetwarzania zadań w tle (np. wysyłanie powiadomień o rezerwacji).


## Etap I: Uruchamianie z Docker Compose

Wymagania:
  * Zainstalowany Docker (https://www.docker.com/get-started)
  * Zainstalowany Docker Compose (zazwyczaj jest częścią instalacji Docker Desktop)

### 1. Sklonuj repozytorium:
```
   git clone git@github.com:Sylwia212/Booking_platfrom.git
   cd Booking_platfrom
```
### 2. Zainstaluj zależności Node.js dla każdego serwisu:
```
cd user-service && npm install && cd ..
cd booking-core-service && npm install && cd ..
cd booking-api && npm install && cd ..
```
### 3. Zbuduj obrazy i uruchom kontenery:
```
docker-compose up --build -d
```
### 4. Dostęp do aplikacji:
  *  Interfejs użytkownika `booking-ui` powinien być dostępny pod adresem: `http://localhost:8080`
  * Panel zarządzania RabbitMQ: http://localhost:15672 (login/hasło: `user/rabbit_secret_pass` z Twojego `.env`)
### 5. Zatrzymywanie kontenerów:
```
docker-compose down
```
Aby usunąć również woluminy (uwaga: dane zostaną usunięte!):
```
docker-compose down -v
```

## Etap II: Uruchamianie w Kubernetes

Wymagania:
  * Zainstalowany kubectl (https://kubernetes.io/docs/tasks/tools/)
  * Działający lokalny klaster Kubernetes (np. Kubernetes w Docker Desktop).
  * Zainstalowany Metrics Server w klastrze (dla HPA).
    ```
    kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml
    ```

### 1. Zastosuj Sekrety i ConfigMapy:
```
kubectl apply -f ./kubernetes_manifests/00-secrets.yaml
kubectl apply -f ./kubernetes_manifests/01-configmap.yaml
kubectl apply -f ./kubernetes_manifests/postgres-init-configmap.yaml 
kubectl apply -f ./kubernetes_manifests/nginx-config-configmap.yaml
```
### 2. Zastosuj PersistentVolumeClaims:
```
kubectl apply -f ./kubernetes_manifests/postgres-pvc.yaml
kubectl apply -f ./kubernetes_manifests/redis-pvc.yaml
kubectl apply -f ./kubernetes_manifests/rabbitmq-pvc.yaml
```
### 3. Wdróż usługi zależne (w tej kolejności lub równolegle, ale poczekaj na ich gotowość):
```
kubectl apply -f ./kubernetes_manifests/postgresql-deployment.yaml
kubectl apply -f ./kubernetes_manifests/postgresql-service.yaml

kubectl apply -f ./kubernetes_manifests/redis-deployment.yaml
kubectl apply -f ./kubernetes_manifests/redis-service.yaml

kubectl apply -f ./kubernetes_manifests/rabbitmq-deployment.yaml
kubectl apply -f ./kubernetes_manifests/rabbitmq-service.yaml
```
### 4. Wdróż mikroserwisy aplikacyjne:Wdróż mikroserwisy aplikacyjne:
```
kubectl apply -f ./kubernetes_manifests/user-service-deployment.yaml
kubectl apply -f ./kubernetes_manifests/user-service-service.yaml

kubectl apply -f ./kubernetes_manifests/booking-core-service-deployment.yaml
kubectl apply -f ./kubernetes_manifests/booking-core-service-service.yaml

kubectl apply -f ./kubernetes_manifests/booking-api-deployment.yaml
kubectl apply -f ./kubernetes_manifests/booking-api-service.yaml

kubectl apply -f ./kubernetes_manifests/booking-ui-deployment.yaml
kubectl apply -f ./kubernetes_manifests/booking-ui-service.yaml
```
### 5. Dostęp do aplikacji:
  * Interfejs użytkownika `booking-ui` powinien być dostępny pod adresem: `http://localhost`

### 6. Skalowanie i HPA:
```
kubectl apply -f ./kubernetes_manifests/booking-api-hpa.yaml
kubectl get hpa booking-api-hpa -w
```
### 7. Czyszczenie zasobów Kubernetes:
```
kubectl delete -f ./kubernetes_manifests/ 
```

## Autor
### Sylwia Kruszyńska

