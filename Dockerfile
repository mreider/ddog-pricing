FROM golang:1.22-alpine AS builder

WORKDIR /app

COPY go.mod ./
RUN go mod download

COPY . .

RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-w -s" -o /server ./main.go

FROM scratch

COPY --from=builder /server /server

EXPOSE 8080

USER 65534:65534

ENTRYPOINT ["/server"]
