from datetime import datetime, timedelta
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session
from sqlalchemy import select
from jose import JWTError, jwt
from passlib.context import CryptContext
from typing import Optional

from app.core.database import get_db
from app.core.config import settings
from app.models.employee import Employee

router = APIRouter()
security = HTTPBearer()
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# JWT settings
SECRET_KEY = settings.jwt_secret_key
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 7 days


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against its hash."""
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    """Hash a password."""
    return pwd_context.hash(password)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    """Create a JWT access token."""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


def get_current_employee(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
) -> Employee:
    """Get the current authenticated employee from JWT token."""
    token = credentials.credentials
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        employee_id: str = payload.get("sub")
        if employee_id is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid authentication credentials",
            )
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
        )

    employee = db.get(Employee, UUID(employee_id))
    if employee is None or not employee.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Employee not found or inactive",
        )
    return employee


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    employee_id: str
    name: str
    email: str
    company_id: str


@router.post("/login", response_model=LoginResponse)
def login(req: LoginRequest, db: Session = Depends(get_db)):
    """Login endpoint for employees."""
    # Find employee by email
    stmt = select(Employee).where(Employee.email == req.email.lower())
    employee = db.execute(stmt).scalar_one_or_none()

    if not employee:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    if not employee.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Employee account is inactive",
        )

    # Check if employee has a password set
    if not employee.password_hash:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Password not set. Please contact your administrator.",
        )

    # Verify password
    if not verify_password(req.password, employee.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    # Create access token
    access_token = create_access_token(data={"sub": str(employee.employee_id)})

    return LoginResponse(
        access_token=access_token,
        employee_id=str(employee.employee_id),
        name=employee.name,
        email=employee.email,
        company_id=str(employee.company_id),
    )


@router.get("/me")
def get_current_user_info(current_employee: Employee = Depends(get_current_employee)):
    """Get current authenticated employee info."""
    return {
        "employee_id": str(current_employee.employee_id),
        "name": current_employee.name,
        "email": current_employee.email,
        "company_id": str(current_employee.company_id),
    }


@router.post("/set-password")
def set_employee_password(
    employee_id: UUID,
    password: str,
    db: Session = Depends(get_db),
):
    """Set password for an employee (admin function)."""
    employee = db.get(Employee, employee_id)
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")

    employee.password_hash = get_password_hash(password)
    db.commit()
    return {"message": "Password set successfully"}

