# Резервні копії Baget → Google Диск

Це окреме завдання резервного копіювання. Воно не замінює збірку основного бекенду з GitHub. Застосування файлів Java/Vue додає інтерфейс, але саме по собі НЕ налаштовує резервування в Google Cloud.

## Що входить у копію

Одна повна база MySQL: таблиці, дані, представлення, процедури, функції, події та тригери. Формат SQL, стиснутий gzip (`.sql.gz`). Файли фотографій/вкладень поза БД, вихідні коди, користувачі MySQL, Google Secret Manager та налаштування хмарної інфраструктури сюди не входять. Їх потрібно зберігати окремо.

Використовується `mysqldump --single-transaction` для InnoDB. Якщо є таблиці іншого рушія, завдання відмовиться створювати копію, щоб не позначити її узгодженою помилково. Під час копіювання не запускайте Flyway або інші зміни структури таблиць. Звичайна робота з даними може продовжуватися.

## 1. Оновлення застосунку

Скопіюйте `backend/src` та `frontend/src` у відповідні проєкти. Міграція V91 створює лише дві нові службові таблиці. Переконайтеся, що V91 ще не зайнята вашою іншою міграцією; вже застосовані міграції не змінюйте. У наданому build.gradle бібліотека Google Auth уже є, додаткових Java-залежностей немає.

Перевірки локально:

```powershell
.\gradlew.bat test --tests "com.example.baget.backup.*"
npm run build
```

Після оновлення з’явиться Налаштування → Резервні копії. Початково автоматичний розклад вимкнений. Рекомендовані початкові значення: щодня о 03:00 за Києвом, 14 успішних копій.

## 2. Одноразове підключення Google Диска

На своєму комп’ютері встановіть Python 3.11+.

У Google Cloud Console:

1. Увімкніть Google Drive API.
2. Налаштуйте OAuth consent screen для власного використання. Для External не залишайте застосунок у статусі Testing: дозвіл на фоновий доступ у цьому режимі зазвичай закінчується через 7 днів. Переведіть у Production. Можливі вимоги Google залежать від типу облікового запису та публікації застосунку.
3. Створіть OAuth client типу **Desktop app**, завантажте його JSON на свій комп’ютер як `client-secret.json` (не комітьте у Git).
4. Скрипт запитує лише `drive.file`: доступ до файлів, створених/наданих застосунку, а не до всього Диска.

У папці `backup-job`:

```powershell
py -m venv .venv
.\.venv\Scripts\python -m pip install -r requirements.txt
.\.venv\Scripts\python connect_drive.py --client client-secret.json
```

Відкриється браузер. Увійдіть під власником Диска і надайте доступ. Скрипт створить папку «Baget — резервні копії», виведе `BACKUP_DRIVE_FOLDER_ID` та збереже `drive-authorized-user.json`. Це секрет для автоматичної роботи; він НЕ надсилається через форму застосунку і НЕ записується у базу, що копіюється.

Завантажте JSON як secret `baget-drive-oauth` у Google Secret Manager. Не надсилайте його в чат/Telegram і не додавайте до репозиторію. Після безпечного збереження в Secret Manager видаліть незахищені тимчасові локальні копії. Повторне підключення з новим OAuth client створює окремий набір доступних йому файлів; старі копії залишаються на Диску.

## 3. Доступ до зовнішнього MySQL

Створіть secret `baget-backup-db` з JSON (значення прикладові):

```json
{
  "host": "MYSQL_HOSTNAME",
  "port": 3306,
  "database": "DATABASE_NAME",
  "user": "BACKUP_USER",
  "password": "YOUR_PASSWORD",
  "ca": "/etc/ssl/certs/ca-certificates.crt"
}
```

Потрібен доступ із Cloud Run Job до вашого сервера MySQL, як у бекенду. Якщо сервер обмежує IP, налаштуйте для завдання той самий перевірений мережевий маршрут/VPC+NAT з дозволеною вихідною адресою. Звичайні динамічні адреси Cloud Run не гарантують проходження IP-фільтра.

З’єднання перевіряє TLS-сертифікат та ім’я сервера (`VERIFY_IDENTITY`). Якщо у постачальника власний CA, змонтуйте його у завдання й змініть поле `ca`; не вимикайте перевірку TLS. Обліковий запис потребує доступу для читання всіх об’єктів цієї БД, експорту views/routines/events/triggers та SELECT/INSERT/UPDATE таблиць `backup_settings`, `backup_runs`. Конкретні права для процедур залежать від версії сервера та його політики; погодьте їх із адміністратором БД. Завдання не потребує зміни бізнес-таблиць. Пароль передається mysqldump через приватний тимчасовий options-файл, не через командний рядок.

## 4. Окреме Cloud Run Job

Нижче команди для **Google Cloud Shell (Bash)**. Вони створюють ресурси і можуть впливати на оплату Google Cloud. Тут вони не запускалися. Підставте свої значення; ім’я сервісу/проєкту не вгадується. Основний workflow GitHub та його build.gradle не змінюються.

```bash
export BACKUP_PROJECT='YOUR_PROJECT_ID'
export BACKUP_REGION='europe-west4'
export BACKUP_REPOSITORY='baget-backups'
export BACKUP_JOB='baget-backup'
export BACKUP_FOLDER='FOLDER_ID_FROM_SCRIPT'
export BACKUP_SA="baget-backup@${BACKUP_PROJECT}.iam.gserviceaccount.com"
export SCHEDULER_SA="baget-backup-scheduler@${BACKUP_PROJECT}.iam.gserviceaccount.com"
export BACKEND_SA='EXISTING_BACKEND_SERVICE_ACCOUNT_EMAIL'
export BACKUP_IMAGE="${BACKUP_REGION}-docker.pkg.dev/${BACKUP_PROJECT}/${BACKUP_REPOSITORY}/worker:v1"

gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com cloudscheduler.googleapis.com secretmanager.googleapis.com drive.googleapis.com --project="$BACKUP_PROJECT"
gcloud iam service-accounts create baget-backup --project="$BACKUP_PROJECT"
gcloud iam service-accounts create baget-backup-scheduler --project="$BACKUP_PROJECT"
gcloud artifacts repositories create "$BACKUP_REPOSITORY" --repository-format=docker --location="$BACKUP_REGION" --project="$BACKUP_PROJECT"
```

Створіть secrets через інтерфейс Secret Manager або `gcloud secrets create ... --data-file=...`. У прикладах далі версія `1`; якщо використовуєте іншу, вкажіть її явно. IAM користувача, який розгортає Job, має дозволяти `actAs` для обраного service account. Cloud Build account має право писати образ у репозиторій Artifact Registry.

```bash
gcloud secrets add-iam-policy-binding baget-drive-oauth --member="serviceAccount:${BACKUP_SA}" --role=roles/secretmanager.secretAccessor --project="$BACKUP_PROJECT"
gcloud secrets add-iam-policy-binding baget-backup-db --member="serviceAccount:${BACKUP_SA}" --role=roles/secretmanager.secretAccessor --project="$BACKUP_PROJECT"
gcloud secrets add-iam-policy-binding baget-drive-oauth --member="serviceAccount:${BACKEND_SA}" --role=roles/secretmanager.secretAccessor --project="$BACKUP_PROJECT"
```

Перейдіть у папку `backup-job`, завантажену в Cloud Shell:

```bash
gcloud builds submit . --config=cloudbuild.yaml --substitutions="_IMAGE=${BACKUP_IMAGE}" --project="$BACKUP_PROJECT"
gcloud run jobs create "$BACKUP_JOB" --image="$BACKUP_IMAGE" --region="$BACKUP_REGION" --project="$BACKUP_PROJECT" --service-account="$BACKUP_SA" --tasks=1 --parallelism=1 --max-retries=0 --task-timeout=3600s --cpu=2 --memory=8Gi --set-secrets="/secrets/drive/credentials.json=baget-drive-oauth:1,/secrets/db/config.json=baget-backup-db:1" --set-env-vars="BACKUP_DB_CONFIG_FILE=/secrets/db/config.json,BACKUP_DRIVE_CREDENTIALS_FILE=/secrets/drive/credentials.json,BACKUP_DRIVE_FOLDER_ID=${BACKUP_FOLDER}"
gcloud run jobs add-iam-policy-binding "$BACKUP_JOB" --region="$BACKUP_REGION" --project="$BACKUP_PROJECT" --member="serviceAccount:${SCHEDULER_SA}" --role=roles/run.invoker
gcloud run jobs add-iam-policy-binding "$BACKUP_JOB" --region="$BACKUP_REGION" --project="$BACKUP_PROJECT" --member="serviceAccount:${BACKEND_SA}" --role=roles/run.invoker
```

Для подальших версій збирайте новий тег образу і використовуйте `gcloud run jobs update`, а не повторне create. Dockerfile встановлює Oracle MySQL client з Ubuntu, не MariaDB client. Сумісність дампу з вашим MySQL 8.4 потрібно підтвердити пробним відновленням.

Cloud Run тимчасові файли займають пам’ять. Під час стиснення одночасно існують SQL та gzip. 8 GiB — початкова конфігурація для невеликої БД, а не гарантія будь-якого розміру. Якщо SQL наближається до декількох GiB, потрібна інша конфігурація/потокова схема. Таймаут дампу 30 хвилин, всього завдання — 1 година.

## 5. Планувальник

Scheduler кожні 15 хвилин запускає коротку перевірку розкладу, а копія створюється лише коли настав час або є ручний запит. Завдання завершується, коли роботи немає. Це окремі платні виклики Cloud Run/Scheduler згідно з вашим тарифом. Після налаштування розклад щодня/щотижня змінюється з форми без зміни Scheduler.

```bash
gcloud scheduler jobs create http baget-backup-poll --project="$BACKUP_PROJECT" --location="$BACKUP_REGION" --schedule='*/15 * * * *' --time-zone='Etc/UTC' --uri="https://run.googleapis.com/v2/projects/${BACKUP_PROJECT}/locations/${BACKUP_REGION}/jobs/${BACKUP_JOB}:run" --http-method=POST --oauth-service-account-email="$SCHEDULER_SA" --headers='Content-Type=application/json' --message-body='{}'
```

Дозвіл Cloud Scheduler service agent на генерацію токенів має бути увімкнений стандартним механізмом Google Cloud. Планувальник використовує OAuth для Google API, не OIDC. Він не викликає публічний API вашої програми.

## 6. Зв’язок із бекендом

У поточному Cloud Run **сервісі бекенду**, зберігаючи всі його інші параметри:

- змонтуйте secret `baget-drive-oauth` версії 1 як `/secrets/backup-drive/credentials.json`;
- додайте env `BACKUP_DRIVE_CREDENTIALS_FILE=/secrets/backup-drive/credentials.json`;
- додайте env `BACKUP_JOB=projects/YOUR_PROJECT_ID/locations/europe-west4/jobs/baget-backup`.

Spring relaxed binding відобразить їх у `backup.drive-credentials-file` та `backup.job`. Runtime service account бекенду повинен збігатися з `BACKEND_SA` вище. Перший secret потрібен лише для завантаження копії адміністратором через програму. Бекенд не виконує mysqldump і не потребує утиліти MySQL у своєму образі.

Не переплутайте `BACKUP_DRIVE_CREDENTIALS_FILE` (завдання читає саме цю змінну) та `BACKUP_DB_CONFIG_FILE`; вони посилаються на різні файли. Бекенд використовує лише credentials і job.

## 7. Перша перевірка

1. Розгорніть бекенд і фронтенд, переконайтеся, що V91 застосована.
2. Створіть Job, secrets, Scheduler та IAM за пунктами вище.
3. Увійдіть як ADMIN. Натисніть «Створити копію зараз». Запит спершу зберігається в БД; навіть якщо виклик Google API не вдався, Scheduler підхопить його.
4. Через декілька хвилин натисніть «Оновити». Очікуваний стан: «Збережено». У папці на Google Диску — SQL.gz. Перевіряється розмір і MD5 від Google; SHA-256 файлу збережена для незалежної перевірки.
5. Натисніть «Завантажити на комп’ютер». Доступ перевіряється сервером за активним ROLE_ADMIN. Токен Google не передається браузеру. Для великих файлів браузер використовує пам’ять під Blob; їх можна завантажити безпосередньо з Google Диска.
6. Порівняйте SHA-256 (`Get-FileHash файл.sql.gz -Algorithm SHA256` у PowerShell).
7. Відновіть копію в **окрему тестову БД**, перевірте замовлення, склад, ledger та зв’язки. Лише після цього вважайте резервування введеним у роботу.
8. Увімкніть щоденний/щотижневий розклад і перевірте перший автоматичний запуск.

Стан READY означає доступ до папки на час останньої перевірки, не успішність самої копії. Якщо дата перевірки застаріла, перевірте Scheduler і журнал виконань Job. При втраті доступу/місця копія не позначається успішною. Для захисту секретів подробиці відповідей Google, SQL, пароль та stderr дампу не потрапляють у публічну історію чи лог. Помилки конфігурації перевіряються через налаштування Job, IAM і права MySQL.

## 8. Зберігання й перервані запуски

- Налаштування «зберігати N» рахує успішні копії, створені цим встановленням програми. Чужі файли не видаляються.
- Старі файли переносяться у кошик Диска після успішної нової копії. Кошик також займає квоту до його очищення Google/власником; це не негайне звільнення місця.
- Одночасне створення захищено MySQL advisory lock; повторне натискання має ключ запиту, плановий запуск — унікальний часовий слот.
- Після збою наступний запуск перевіряє попередньо виділений ID файлу та checksum. Підтверджений файл отримує SUCCESS, незавершений — FAILED. Немає нескінченного автоматичного повторення помилкового дампу.
- Якщо планувальник був недоступний, виконується останній пропущений слот після дати ввімкнення, а не всі пропущені дні.
- Час Europe/Kyiv. При осінньому повторенні години копія не дублюється, при весняному пропуску години виконується після переходу.
- Вимкнення автоматичного режиму зупиняє нові планові запити; вже створені та ручні запити виконуються.
- Менеджери, майстер і бухгалтер не отримують доступу до повної БД через ці API.

## 9. Відновлення

Кнопки «відновити поверх робочої БД» немає. Спочатку розпакуйте gzip, створіть порожню тестову базу MySQL 8.4 і імпортуйте SQL клієнтом MySQL. Дамп може містити DROP TABLE; не направляйте його у робочу базу під час перевірки.

Приклад у Linux/Cloud Shell із заздалегідь налаштованим TLS та доступом:

```bash
gzip -t baget-copy.sql.gz
gzip -dc baget-copy.sql.gz > baget-copy.sql
mysql --host=TEST_HOST --user=RESTORE_USER --password --ssl-mode=VERIFY_IDENTITY baget_restore_test < baget-copy.sql
```

Використовуйте окремого користувача, якому доступна лише тестова БД. Якщо дефайнери views/routines/triggers не існують на тестовому сервері, потрібне погоджене перенесення цих об’єктів адміністратором. Автоматично вирізати їх з копії не слід. Не підключайте тестовий застосунок до production Scheduler, Google Drive secrets чи Telegram. У відновленій тестовій базі вимкніть backup_settings.enabled; для окремого робочого встановлення потрібні новий installation_id та окрема папка Диска.

## Перевірено під час підготовки

18 Python unit tests: розклад, DST, checksum, зберігання. Java-сервіс перевірено із fake JDBC/framework, включно з доступом, повторним запитом і SQL-параметрами. Компілятор Vue перевірив усі SFC. Це НЕ реальний запуск MySQL/Google Drive/Cloud Run і не повний Gradle/Vite build. Жодні хмарні ресурси не створені, кошти не витрачені, база користувача не змінена.

Офіційна документація:
- https://docs.cloud.google.com/run/docs/execute/jobs-on-schedule
- https://developers.google.com/identity/protocols/oauth2/web-server
- https://developers.google.com/identity/protocols/oauth2 (обмеження Testing 7 днів)
- https://developers.google.com/workspace/drive/api/guides/api-specific-auth
- https://developers.google.com/workspace/drive/api/guides/manage-uploads
- https://dev.mysql.com/doc/refman/8.4/en/mysqldump.html
