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
from app.models.manager import Manager
from app.models.system_admin import SystemAdmin

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


def decode_token(token: str) -> dict:
    """Decode JWT token and return payload."""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
        )


def get_current_employee(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
) -> Employee:
    """Get the current authenticated employee from JWT token."""
    token = credentials.credentials
    payload = decode_token(token)
    
    role = payload.get("role")
    if role != "employee":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This endpoint requires employee role",
        )
    
    employee_id: str = payload.get("sub")
    if employee_id is None:
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


def get_current_manager(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
) -> Manager:
    """Get the current authenticated manager from JWT token."""
    token = credentials.credentials
    payload = decode_token(token)
    
    role = payload.get("role")
    if role != "manager":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This endpoint requires manager role",
        )
    
    manager_id: str = payload.get("sub")
    if manager_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
        )

    manager = db.get(Manager, UUID(manager_id))
    if manager is None or not manager.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Manager not found or inactive",
        )
    return manager


def get_current_system_admin(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
) -> SystemAdmin:
    """Get the current authenticated system admin from JWT token."""
    token = credentials.credentials
    payload = decode_token(token)
    
    role = payload.get("role")
    if role != "system_admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This endpoint requires system admin role",
        )
    
    admin_id: str = payload.get("sub")
    if admin_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
        )

    admin = db.get(SystemAdmin, UUID(admin_id))
    if admin is None or not admin.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="System admin not found or inactive",
        )
    return admin


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str  # "employee", "manager", or "system_admin"
    user_id: str  # employee_id, manager_id, or admin_id
    name: str
    email: str
    company_id: Optional[str] = None  # Only for employees and managers


@router.post("/login/employee")
def login_employee(req: LoginRequest, db: Session = Depends(get_db)):
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

    # Create access token with role
    access_token = create_access_token(data={
        "sub": str(employee.employee_id),
        "role": "employee"
    })

    return LoginResponse(
        access_token=access_token,
        role="employee",
        user_id=str(employee.employee_id),
        name=employee.name,
        email=employee.email,
        company_id=str(employee.company_id),
    )


@router.post("/login/manager")
def login_manager(req: LoginRequest, db: Session = Depends(get_db)):
    """Login endpoint for managers."""
    # Find manager by email
    stmt = select(Manager).where(Manager.email == req.email.lower())
    manager = db.execute(stmt).scalar_one_or_none()

    if not manager:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    if not manager.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Manager account is inactive",
        )

    # Check if manager has a password set
    if not manager.password_hash:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Password not set. Please contact your administrator.",
        )

    # Verify password
    if not verify_password(req.password, manager.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    # Create access token with role
    access_token = create_access_token(data={
        "sub": str(manager.manager_id),
        "role": "manager"
    })

    return LoginResponse(
        access_token=access_token,
        role="manager",
        user_id=str(manager.manager_id),
        name=manager.name,
        email=manager.email,
        company_id=str(manager.company_id),
    )


@router.post("/login/system-admin")
def login_system_admin(req: LoginRequest, db: Session = Depends(get_db)):
    """Login endpoint for system admins."""
    # Find system admin by email
    stmt = select(SystemAdmin).where(SystemAdmin.email == req.email.lower())
    admin = db.execute(stmt).scalar_one_or_none()

    if not admin:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    if not admin.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="System admin account is inactive",
        )

    # Verify password
    if not verify_password(req.password, admin.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    # Create access token with role
    access_token = create_access_token(data={
        "sub": str(admin.admin_id),
        "role": "system_admin"
    })

    return LoginResponse(
        access_token=access_token,
        role="system_admin",
        user_id=str(admin.admin_id),
        name=admin.name,
        email=admin.email,
        company_id=None,
    )


@router.get("/me")
def get_current_user_info(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
):
    """Get current authenticated user info (works for any role)."""
    token = credentials.credentials
    payload = decode_token(token)
    
    role = payload.get("role")
    user_id = payload.get("sub")
    
    if role == "employee":
        employee = db.get(Employee, UUID(user_id))
        if not employee:
            raise HTTPException(status_code=404, detail="Employee not found")
        return {
            "role": "employee",
            "user_id": str(employee.employee_id),
            "name": employee.name,
            "email": employee.email,
            "company_id": str(employee.company_id),
        }
    elif role == "manager":
        manager = db.get(Manager, UUID(user_id))
        if not manager:
            raise HTTPException(status_code=404, detail="Manager not found")
        return {
            "role": "manager",
            "user_id": str(manager.manager_id),
            "name": manager.name,
            "email": manager.email,
            "company_id": str(manager.company_id),
        }
    elif role == "system_admin":
        admin = db.get(SystemAdmin, UUID(user_id))
        if not admin:
            raise HTTPException(status_code=404, detail="System admin not found")
        return {
            "role": "system_admin",
            "user_id": str(admin.admin_id),
            "name": admin.name,
            "email": admin.email,
            "company_id": None,
        }
    else:
        raise HTTPException(status_code=400, detail="Unknown role")


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

